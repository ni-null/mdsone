// ============================================================
// plugins/shiki/index.ts — Shiki syntax highlight plugin
//
// Core renders plain fenced blocks first; this plugin rewrites
// <pre><code class="language-...">...</code></pre> using Shiki.
// ============================================================
import { load } from "cheerio";
import { codeToHtml } from "shiki";
import type { Plugin, PluginAssets } from "../../src/core/types.js";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeShikiLang(lang: string): string {
  const v = lang.toLowerCase();
  const aliases: Record<string, string> = {
    "c#": "csharp",
    "cs": "csharp",
    "sh": "bash",
    "shell": "bash",
    "yml": "yaml",
    "md": "markdown",
    "py": "python",
    "rb": "ruby",
    "ps1": "powershell",
    "bat": "batch",
    "js": "javascript",
    "ts": "typescript",
  };
  return aliases[v] ?? v;
}

function normalizeShikiTheme(theme: string): string {
  const v = theme.toLowerCase();
  const aliases: Record<string, string> = {
    "atom-one-dark": "one-dark-pro",
    "atom-one-light": "one-light",
    "github": "github-light",
    "github-dark-dimmed": "github-dark",
  };
  return aliases[v] ?? v;
}

function trimFenceTerminalEol(content: string): string {
  if (content.endsWith("\r\n")) return content.slice(0, -2);
  if (content.endsWith("\n")) return content.slice(0, -1);
  return content;
}

function patchShikiFenceHtml(html: string, lang: string): string {
  const safeLang = escapeHtmlAttr(lang);
  const withDataLang = html.replace(/^<pre([^>]*)>/, `<pre$1 data-lang="${safeLang}">`);
  return withDataLang.replace(
    /^<pre([^>]*)><code([^>]*)>/,
    (_m, preAttrs: string, codeAttrs: string) => {
      if (/class=/.test(codeAttrs)) {
        return `<pre${preAttrs}><code${codeAttrs.replace(/class=(["'])(.*?)\1/, `class=$1$2 language-${safeLang}$1`)}>`;
      }
      return `<pre${preAttrs}><code class="language-${safeLang}"${codeAttrs}>`;
    },
  );
}

async function renderShikiFence(
  code: string,
  lang: string,
  themeDark: string,
  themeLight: string,
): Promise<string | null> {
  const normalizedLang = normalizeShikiLang(lang);
  const dark = normalizeShikiTheme(themeDark);
  const light = normalizeShikiTheme(themeLight);
  const normalizedCode = trimFenceTerminalEol(code);
  try {
    const shikiHtml = await codeToHtml(normalizedCode, {
      lang: normalizedLang,
      themes: { dark, light },
    });
    return patchShikiFenceHtml(shikiHtml, lang);
  } catch {
    try {
      const shikiHtml = await codeToHtml(normalizedCode, {
        lang: normalizedLang,
        themes: { dark: "github-dark", light: "github-light" },
      });
      return patchShikiFenceHtml(shikiHtml, lang);
    } catch {
      return null;
    }
  }
}

function extractLanguage(codeClass: string | undefined): string | null {
  if (!codeClass) return null;
  const match = codeClass.match(/\blanguage-([^\s]+)/);
  return match?.[1] ?? null;
}

export const shikiPlugin: Plugin = {
  name: "shiki",

  registerCli(program) {
    program.option("--code-highlight <true|false>", "Syntax highlighting (default: true)");
  },

  cliToConfig(opts, out) {
    const raw = opts["codeHighlight"];
    if (typeof raw === "string") {
      const v = raw.toLowerCase();
      if (v === "true") out.code_highlight = true;
      if (v === "false") out.code_highlight = false;
    }
  },

  isEnabled: (config) => config.code_highlight,

  async processHtml(html, config) {
    const $ = load(html, { decodeEntities: false }, false);
    const codeNodes = $("pre > code").toArray();
    const themeDark = config.code_highlight_theme || "github-dark";
    const themeLight = config.code_highlight_theme_light || "github-light";

    for (const node of codeNodes) {
      const codeEl = $(node);
      const preEl = codeEl.parent("pre");
      if (!preEl.length) continue;
      if (preEl.hasClass("shiki")) continue;

      const lang = extractLanguage(codeEl.attr("class"));
      if (!lang) continue;

      const codeText = codeEl.text();
      const rendered = await renderShikiFence(codeText, lang, themeDark, themeLight);
      if (!rendered) continue;

      const $frag = load(rendered, { decodeEntities: false }, false);
      const newPre = $frag("pre").first();
      if (!newPre.length) continue;

      // Keep existing pre attributes unless Shiki already set them.
      const oldAttrs = preEl.attr() ?? {};
      for (const [k, v] of Object.entries(oldAttrs)) {
        if (newPre.attr(k) === undefined) newPre.attr(k, v);
      }

      preEl.replaceWith(newPre);
    }

    return $.html() || html;
  },

  getAssets(): PluginAssets {
    return {
      css:
        `<style id="shiki-theme-adapter">` +
        `html:not([data-theme="light"]) pre.shiki,` +
        `html:not([data-theme="light"]) pre.shiki code,` +
        `html:not([data-theme="light"]) pre.shiki span {` +
        `  color: var(--shiki-dark) !important;` +
        `  background-color: var(--shiki-dark-bg) !important;` +
        `  font-style: var(--shiki-dark-font-style) !important;` +
        `  font-weight: var(--shiki-dark-font-weight) !important;` +
        `  text-decoration: var(--shiki-dark-text-decoration) !important;` +
        `}` +
        `</style>`,
    };
  },
};
