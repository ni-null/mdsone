// ============================================================
// plugins/highlight/index.ts — 語法高亮 Plugin
//
// 依賴：npm highlight.js（server-side 靜態高亮已在 markdown.ts 完成）
// 此 plugin 只負責：
//   1. 從 npm highlight.js 套件讀取主題 CSS，注入雙主題 <style>
//   2. 注入前端主題切換 helper（純 DOM，無需 highlight.js runtime）
// ============================================================

import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import type { Plugin, PluginAssets } from "../../src/core/types.js";

/** 從 npm highlight.js 套件解析 styles/ 目錄 */
function resolveHljsStylesDir(): string {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("highlight.js/package.json");
    return path.join(path.dirname(pkgJson), "styles");
}

async function tryReadCss(filePath: string, label: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, "utf-8");
    } catch {
        console.warn(`[WARN] highlight plugin: theme file not found, skipping: ${label}`);
        return null;
    }
}

export const highlightPlugin: Plugin = {
    name: "highlight",

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
        if (darkCss) cssParts.push(`<style id="hljs-theme-dark">${darkCss}</style>`);
        if (lightCss) cssParts.push(`<style id="hljs-theme-light" disabled>${lightCss}</style>`);

        // 前端切換 helper（不需載入 highlight.js runtime，高亮已靜態完成）
        const themeScript =
            `<script>\n` +
            `try {\n` +
            `window.__mdsone_hljs_theme = function(isDark) {\n` +
            `  var dark  = document.getElementById('hljs-theme-dark');\n` +
            `  var light = document.getElementById('hljs-theme-light');\n` +
            `  if (dark)  dark.disabled  = !isDark;\n` +
            `  if (light) light.disabled =  isDark;\n` +
            `};\n` +
            `} catch(e) {\n` +
            `  console.warn('[mdsone] hljs theme switch failed:', e.message);\n` +
            `  window.__mdsone_hljs_theme = function() {};\n` +
            `}\n` +
            `</script>`;

        return {
            css: cssParts.join("\n"),
            js: themeScript,
        };
    },
};
