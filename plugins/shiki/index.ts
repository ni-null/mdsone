// ============================================================
// plugins/shiki/index.ts — Shiki plugin (transition phase)
//
// Note:
// - This plugin currently manages code theme CSS injection/switching only.
// - Server-side tokenization is still handled in src/core/markdown.ts.
// ============================================================
import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import type { Plugin, PluginAssets } from "../../src/core/types.js";

function resolveHljsStylesDir(): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("highlight.js/package.json");
  return path.join(path.dirname(pkgJson), "styles");
}

async function tryReadCss(filePath: string, label: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    console.warn(`[WARN] shiki plugin: theme file not found, skipping: ${label}`);
    return null;
  }
}

export const shikiPlugin: Plugin = {
  name: "shiki",

  registerCli(program) {
    program.option("--code-highlight <true|false>", "Syntax highlighting (default: true)");
    program.option("--code-highlight-theme <NAME>", "Code dark theme name (default: atom-one-dark)");
    program.option("--code-highlight-theme-light <NAME>", "Code light theme name (default: atom-one-light)");
  },

  cliToConfig(opts, out) {
    const raw = opts["codeHighlight"];
    if (typeof raw === "string") {
      const v = raw.toLowerCase();
      if (v === "true") out.code_highlight = true;
      if (v === "false") out.code_highlight = false;
    }
    const theme = opts["codeHighlightTheme"];
    if (typeof theme === "string" && theme) out.code_highlight_theme = theme;
    const themeLight = opts["codeHighlightThemeLight"];
    if (typeof themeLight === "string" && themeLight) out.code_highlight_theme_light = themeLight;
  },

  isEnabled: (config) => config.code_highlight,

  async getAssets(config): Promise<PluginAssets> {
    const stylesDir = resolveHljsStylesDir();
    const theme = config.code_highlight_theme || "atom-one-dark";
    const themeLight = config.code_highlight_theme_light || "atom-one-light";

    const darkCss = await tryReadCss(
      path.join(stylesDir, `${theme}.min.css`),
      `${theme}.min.css`,
    );
    const lightCss = await tryReadCss(
      path.join(stylesDir, `${themeLight}.min.css`),
      `${themeLight}.min.css`,
    );

    const cssParts: string[] = [];
    if (darkCss) cssParts.push(`<style id="code-theme-dark">${darkCss}</style>`);
    if (lightCss) cssParts.push(`<style id="code-theme-light" disabled>${lightCss}</style>`);

    const themeScript =
      `<script>\n` +
      `try {\n` +
      `window.__mdsone_code_theme = function(isDark) {\n` +
      `  var dark  = document.getElementById('code-theme-dark');\n` +
      `  var light = document.getElementById('code-theme-light');\n` +
      `  if (dark)  dark.disabled  = !isDark;\n` +
      `  if (light) light.disabled =  isDark;\n` +
      `};\n` +
      `var __mdsone_code_theme_apply = function() {\n` +
      `  var html = document.documentElement;\n` +
      `  var isDark = html.getAttribute('data-theme') !== 'light';\n` +
      `  window.__mdsone_code_theme(isDark);\n` +
      `};\n` +
      `if (document.readyState === 'loading') {\n` +
      `  document.addEventListener('DOMContentLoaded', __mdsone_code_theme_apply);\n` +
      `} else {\n` +
      `  __mdsone_code_theme_apply();\n` +
      `}\n` +
      `if (typeof MutationObserver !== 'undefined') {\n` +
      `  var htmlEl = document.documentElement;\n` +
      `  var obs = new MutationObserver(function (mutations) {\n` +
      `    mutations.forEach(function (m) {\n` +
      `      if (m.type === 'attributes' && m.attributeName === 'data-theme') {\n` +
      `        __mdsone_code_theme_apply();\n` +
      `      }\n` +
      `    });\n` +
      `  });\n` +
      `  obs.observe(htmlEl, { attributes: true });\n` +
      `}\n` +
      `} catch(e) {\n` +
      `  console.warn('[mdsone] code theme switch failed:', e.message);\n` +
      `  window.__mdsone_code_theme = function() {};\n` +
      `}\n` +
      `</script>`;

    return {
      css: cssParts.join("\n"),
      js: themeScript,
    };
  },
};
