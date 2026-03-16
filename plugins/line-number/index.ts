// ============================================================
// plugins/line-number/index.ts — Line number plugin
// ============================================================

import type { Plugin, PluginAssets } from "../../src/core/types.js";
import { getLineNumberScript, getLineNumberStyle } from "./line-number.js";

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

  getAssets(): PluginAssets {
    const script = getLineNumberScript();
    const css = `<style id="mdsone-line-number">\n${getLineNumberStyle()}\n</style>`;
    const js =
      `<script>\n` +
      `try {\n` +
      script +
      `\n` +
      `var __mdsone_ln_apply = function (root) { window.__mdsone_line_number(root) };\n` +
      `if (document.readyState === 'loading') {\n` +
      `  document.addEventListener('DOMContentLoaded', function () { __mdsone_ln_apply(document.body); });\n` +
      `} else {\n` +
      `  __mdsone_ln_apply(document.body);\n` +
      `}\n` +
      `if (typeof MutationObserver !== 'undefined') {\n` +
      `  var obs = new MutationObserver(function (mutations) {\n` +
      `    mutations.forEach(function (m) {\n` +
      `      m.addedNodes && m.addedNodes.forEach(function (n) {\n` +
      `        if (n && n.nodeType === 1) __mdsone_ln_apply(n);\n` +
      `      });\n` +
      `    });\n` +
      `  });\n` +
      `  obs.observe(document.body, { childList: true, subtree: true });\n` +
      `}\n` +
      `} catch(e) {\n` +
      `  console.warn('[mdsone] Failed to load line numbers:', e.message);\n` +
      `}\n` +
      `</script>`;

    return { css, js };
  },
};
