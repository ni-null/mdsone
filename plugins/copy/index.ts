// ============================================================
// plugins/copy/index.ts — 複製按鈕 Plugin
// ============================================================

import type { Config, Plugin, PluginAssets } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
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
type CopyMode = "off" | "line" | "cmd" | "none";
type CopyPluginConfig = { enable?: boolean; mode?: string };

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

function readCopyPluginConfig(config: Config): CopyPluginConfig {
    const raw = config.plugins?.config?.["copy"];
    return (raw && typeof raw === "object" ? raw : {}) as CopyPluginConfig;
}

function normalizeCopyMode(mode: string | undefined): CopyMode {
    if (mode === "off" || mode === "line" || mode === "cmd" || mode === "none") return mode;
    return "none";
}

function resolveCopyRuntime(config: Config): { enable: boolean; mode: CopyMode } {
    const raw = readCopyPluginConfig(config);
    return {
        enable: raw.enable ?? true,
        mode: normalizeCopyMode(raw.mode),
    };
}

export const copyPlugin: Plugin = {
    name: "copy",

    registerCli(program) {
        const parseMode = (raw: string): "off" | "line" | "cmd" => {
            const v = String(raw ?? "").trim().toLowerCase();
            if (v === "off" || v === "line" || v === "cmd") return v;
            throw new Error("Invalid value for --code-copy. Use off|line|cmd.");
        };
        program.option(
            "--code-copy <off|line|cmd>",
            "Copy button mode (use --code-copy=off|line|cmd)",
            parseMode,
        );
    },

    cliToConfig(opts, out) {
        const raw = opts["codeCopy"];
        if (raw === undefined) return;
        const previous = out.plugins ?? {};
        const prevConfig = previous.config ?? {};
        const prevCopy = (prevConfig["copy"] ?? {}) as Record<string, unknown>;
        const v = String(raw).toLowerCase();
        if (v === "off") {
            out.plugins = {
                ...previous,
                config: {
                    ...prevConfig,
                    copy: { ...prevCopy, enable: false, mode: "off" },
                },
            };
        } else if (v === "line") {
            out.plugins = {
                ...previous,
                config: {
                    ...prevConfig,
                    copy: { ...prevCopy, enable: true, mode: "line" },
                },
            };
        } else if (v === "cmd") {
            out.plugins = {
                ...previous,
                config: {
                    ...prevConfig,
                    copy: { ...prevCopy, enable: true, mode: "cmd" },
                },
            };
        }
    },

    isEnabled: (config) => {
        const runtime = resolveCopyRuntime(config);
        return runtime.enable && runtime.mode !== "off" && runtime.mode !== "none";
    },

    processHtml(html, config) {
        const { mode } = resolveCopyRuntime(config);
        if (mode !== "line" && mode !== "cmd") return html;

        const $ = load(html, {}, false);
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
        const runtime  = resolveCopyRuntime(config);
        const mode     = runtime.mode;
        const blockOn  = runtime.enable && mode !== "off" && mode !== "none";

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

export interface CopyOptions {
    /**
     * off: disable
     * line: per-command line copy
     * cmd: section copy by comments
     */
    mode?: "off" | "line" | "cmd";
    /** Enable/disable copy plugin globally. */
    enable?: boolean;
    /** Advanced override for full config control. */
    config?: Partial<Config>;
}

function resolveCopyConfig(options: CopyOptions = {}): Config {
    const mode = options.mode ?? "line";
    const enable = options.enable ?? true;
    const plugins = options.config?.plugins ?? {};
    const pluginConfig = plugins.config ?? {};
    const copy = (pluginConfig["copy"] ?? {}) as Record<string, unknown>;
    return {
        ...DEFAULT_CONFIG,
        ...options.config,
        plugins: {
            ...plugins,
            config: {
                ...pluginConfig,
                copy: { ...copy, enable, mode },
            },
        },
    };
}

/** Convenience transformer: `result = await copy(result)` */
export async function copy(html: string, options: CopyOptions = {}): Promise<string> {
    const config = resolveCopyConfig(options);
    if (!copyPlugin.isEnabled(config) || !copyPlugin.processHtml) return html;
    return await copyPlugin.processHtml(html, config, { sourceDir: "" });
}

/** Plugin CSS/JS assets for host template injection. */
export async function copyAssets(options: CopyOptions = {}): Promise<PluginAssets> {
    const config = resolveCopyConfig(options);
    if (!copyPlugin.isEnabled(config) || !copyPlugin.getAssets) return {};
    return await copyPlugin.getAssets(config);
}
