// ============================================================
// plugins/copy/index.ts — 複製按鈕 Plugin
// ============================================================

import type { Plugin, PluginAssets } from "../../src/core/types.js";
import { getCopyButtonScript, getLineCopyStyle, getCmdCopyStyle } from "./copy-button.js";
import { load } from "cheerio";

function trimTrailingEmpty(lines: string[]): string[] {
    return lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

function parseCommands(rawLines: string[]): Array<{ lines: number[]; text: string }> {
    const cmds: Array<{ lines: number[]; text: string }> = [];
    let i = 0;
    while (i < rawLines.length) {
        let trimmed = rawLines[i].trimEnd();
        if (trimmed === "" || /^\s*#/.test(trimmed)) { i++; continue; }
        const cmdLines = [i];
        const parts = [trimmed.replace(/\\$/, "").trimEnd()];
        while (/\\\s*$/.test(trimmed)) {
            i++;
            if (i >= rawLines.length) break;
            trimmed = rawLines[i].trimEnd();
            if (trimmed === "") break;
            cmdLines.push(i);
            parts.push(trimmed.replace(/\\$/, "").trimEnd());
        }
        cmds.push({ lines: cmdLines, text: parts.join(" ") });
        i++;
    }
    return cmds;
}

type Section = { commentLine: number; comment: string; codeLines: number[]; text: string };

function parseSections(rawLines: string[]): Section[] {
    const sections: Section[] = [];
    let i = 0;
    while (i < rawLines.length) {
        const trimmed = rawLines[i].trim();
        if (/^#/.test(trimmed)) {
            const commentLine = i;
            const comment = trimmed.replace(/^#+\s*/, "");
            const codeLines: number[] = [];
            const codeParts: string[] = [];
            i++;
            while (i < rawLines.length && !/^#/.test(rawLines[i].trim())) {
                const t = rawLines[i].trimEnd();
                if (t.trim() !== "") {
                    codeLines.push(i);
                    codeParts.push(t.replace(/\\$/, "").trimEnd());
                }
                i++;
            }
            if (codeLines.length > 0) sections.push({ commentLine, comment, codeLines, text: codeParts.join("\n") });
        } else {
            i++;
        }
    }
    return sections;
}

export const copyPlugin: Plugin = {
    name: "copy",

    registerCli(program) {
        program.option(
            "--code-copy [mode]",
            "Copy button mode: true/false or line/cmd (default: true)",
        );
        program.option("--line-copy", "Enable per-line copy button on code blocks");
    },

    cliToConfig(opts, out) {
        const raw = opts["codeCopy"];

        // --code-copy 不帶值代表 true
        if (raw === true || raw === undefined) {
            if (opts["lineCopy"] === true) {
                out.code_copy = true;
                out.code_copy_mode = "line";
            }
            return;
        }

        const v = String(raw).toLowerCase();
        if (v === "false") {
            out.code_copy      = false;
            out.code_copy_mode = "none";
        } else if (v === "line") {
            out.code_copy      = true;
            out.code_copy_mode = "line";
        } else if (v === "cmd") {
            out.code_copy      = true;
            out.code_copy_mode = "cmd";
        }
    },

    isEnabled: (config) => config.code_copy !== false,

    processHtml(html, config) {
        const mode = (config.code_copy_mode ?? (config.code_line_copy ? "line" : "none")) as string;
        if (mode !== "line" && mode !== "cmd") return html;

        const $ = load(html, { decodeEntities: false }, false);
        $("pre > code").each((_i, el) => {
            const codeEl = $(el);
            if (codeEl.find(".code-line").length > 0) return;

            const rawLines = trimTrailingEmpty((codeEl.text() || "").split("\n"));
            const htmlLines = trimTrailingEmpty((codeEl.html() || "").split("\n"));
            if (rawLines.length === 0 || htmlLines.length === 0) return;

            if (mode === "line") {
                const cmds = parseCommands(rawLines);
                if (cmds.length === 0) return;
                const lineToCmd = new Map<number, { lines: number[]; text: string }>();
                for (const cmd of cmds) for (const li of cmd.lines) lineToCmd.set(li, cmd);
                const newHtml = htmlLines.map((lineHtml, idx) => {
                    const cmd = lineToCmd.get(idx);
                    if (!cmd) return `<span class="code-line">${lineHtml || "\u200b"}</span>`;
                    const isFirst = cmd.lines[0] === idx;
                    return (
                        `<span class="code-line code-line--cmd${isFirst ? "" : " code-line--cont"}" data-cmd="${encodeURIComponent(cmd.text)}">` +
                        `${lineHtml || "\u200b"}` +
                        `${isFirst ? `<button class="line-copy-btn" type="button" aria-label="Copy command">` +
                            `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
                            `</button>` : ""}` +
                        `</span>`
                    );
                });
                codeEl.html(newHtml.join(""));
                codeEl.parent("pre").attr("data-line-copy-ready", "1");
                return;
            }

            const sections = parseSections(rawLines);
            if (sections.length === 0) return;
            const lineToSection = new Map<number, Section>();
            const lineToSecId = new Map<number, number>();
            sections.forEach((sec, idx) => {
                lineToSection.set(sec.commentLine, sec);
                sec.codeLines.forEach((li) => lineToSecId.set(li, idx));
            });

            const newHtml = htmlLines.map((lineHtml, idx) => {
                const sec = lineToSection.get(idx);
                if (sec) {
                    const secIdx = sections.indexOf(sec);
                    return (
                        `<span class="code-line code-line--sec-head" data-sec="${encodeURIComponent(sec.text)}" data-sec-id="${secIdx}">` +
                        `<span class="sec-comment">${lineHtml || "\u200b"}</span>` +
                        `<button class="sec-copy-btn" type="button" aria-label="Copy section">` +
                        `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
                        `</button>` +
                        `</span>`
                    );
                }
                const sid = lineToSecId.get(idx);
                if (sid !== undefined) return `<span class="code-line code-line--sec-code" data-sec-id="${sid}">${lineHtml || "\u200b"}</span>`;
                return `<span class="code-line">${lineHtml || "\u200b"}</span>`;
            });
            codeEl.html(newHtml.join(""));
            codeEl.parent("pre").attr("data-cmd-copy-ready", "1");
        });

        return $.html() || html;
    },

    getAssets(config): PluginAssets {
        const script   = getCopyButtonScript();
        const mode     = (config.code_copy_mode ?? (config.code_line_copy ? "line" : "none")) as string;
        const blockOn  = config.code_copy !== false;

        // initCall
        const calls: string[] = [];
        if (blockOn)        calls.push("window.__mdsone_copy(root)");
        if (mode === "line") calls.push("window.__mdsone_line_copy(root)");
        if (mode === "cmd")  calls.push("window.__mdsone_cmd_copy(root)");
        const initCall = calls.join("; ");

        // CSS
        let css: string | undefined;
        if (mode === "line") css = `<style id="mdsone-line-copy">\n${getLineCopyStyle()}\n</style>`;
        if (mode === "cmd")  css = `<style id="mdsone-cmd-copy">\n${getCmdCopyStyle()}\n</style>`;

        return {
            css,
            js:
                `<script>\n` +
                `try {\n` +
                script + `\n` +
                `var __mdsone_copy_apply = function (root) { ${initCall} };\n` +
                `if (document.readyState === 'loading') {\n` +
                `  document.addEventListener('DOMContentLoaded', function () { __mdsone_copy_apply(document.body); });\n` +
                `} else {\n` +
                `  __mdsone_copy_apply(document.body);\n` +
                `}\n` +
                `if (typeof MutationObserver !== 'undefined') {\n` +
                `  var obs = new MutationObserver(function (mutations) {\n` +
                `    mutations.forEach(function (m) {\n` +
                `      m.addedNodes && m.addedNodes.forEach(function (n) {\n` +
                `        if (n && n.nodeType === 1) __mdsone_copy_apply(n);\n` +
                `      });\n` +
                `    });\n` +
                `  });\n` +
                `  obs.observe(document.body, { childList: true, subtree: true });\n` +
                `}\n` +
                `} catch(e) {\n` +
                `  console.warn('[mdsone] Failed to load copy button:', e.message);\n` +
                `}\n` +
                `</script>`,
        };
    },
};
