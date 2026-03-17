// ============================================================
// plugins/line-number/index.ts — Line number plugin
// ============================================================

import type { Plugin, PluginAssets } from "../../src/core/types.js";
import { getLineNumberStyle } from "./line-number.js";
import { load } from "cheerio";

function trimTrailingEmpty(lines: string[]): string[] {
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

export const lineNumberPlugin: Plugin = {
  name: "line_number",

  registerCli(program) {
    program.option("--code-line-number [true|false]", "Show line numbers in code blocks (default: false)");
  },

  cliToConfig(opts, out) {
    const raw = opts["codeLineNumber"];
    if (raw === true) {
      out.code_line_number = true;
    } else if (typeof raw === "string") {
      const v = raw.toLowerCase();
      if (v === "true") out.code_line_number = true;
      if (v === "false") out.code_line_number = false;
    }
  },

  isEnabled: (config) => config.code_line_number === true,

  processHtml(html) {
    const $ = load(html, { decodeEntities: false }, false);
    $("pre > code").each((_i, el) => {
      const codeEl = $(el);
      const preEl = codeEl.parent("pre");
      if (!preEl.length) return;

      if (codeEl.find(".code-line").length > 0) {
        codeEl.find(".code-line").each((idx, line) => {
          const lineEl = $(line);
          if (lineEl.find(".code-line-number").length > 0) return;
          const content = lineEl.html() || "\u200b";
          lineEl.html(
            `<span class="code-line-number">${idx + 1}</span><span class="code-line-content">${content}</span>`,
          );
        });
      } else {
        const htmlLines = trimTrailingEmpty((codeEl.html() || "").split("\n"));
        const wrapped = htmlLines.map((lineHtml, idx) =>
          `<span class="code-line"><span class="code-line-number">${idx + 1}</span><span class="code-line-content">${lineHtml || "\u200b"}</span></span>`,
        );
        codeEl.html(wrapped.join(""));
      }

      preEl.addClass("mdsone-line-number");
      preEl.attr("data-line-number-ready", "1");
    });
    return $.html() || html;
  },

  getAssets(): PluginAssets {
    const css = `<style id="mdsone-line-number">\n${getLineNumberStyle()}\n</style>`;
    return { css };
  },
};
