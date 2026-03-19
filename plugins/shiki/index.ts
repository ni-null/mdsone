// ============================================================
// plugins/shiki/index.ts - Shiki syntax highlight plugin
//
// Core renders plain fenced blocks first; this plugin rewrites
// <pre><code class="language-...">...</code></pre> using Shiki.
// ============================================================
import { load } from "cheerio";
import { createHighlighter } from "shiki";
import hljs from "highlight.js";
import type { Config, Plugin, PluginAssets, TemplateData } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

// [OPT-6] 靜態 CSS 提升為模組常數，避免每次 getAssets() 呼叫時重建字串
const SHIKI_THEME_ADAPTER_CSS =
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
  `</style>`;

// [OPT-3] hljs auto-detect 白名單：只嘗試最常見語言，避免全語言掃描
const HLJS_AUTO_DETECT_LANGUAGES = [
  "javascript", "typescript", "python", "bash", "json",
  "css", "html", "sql", "yaml", "java", "go", "rust", "cpp",
];

// [OPT-3] 超過此長度的程式碼不做 auto-detect，避免大檔案拖慢速度
const HLJS_AUTO_DETECT_MAX_CHARS = 500;

// 統一管理 Markdown/hljs 常見語言別名到 Shiki 官方語言代號
const SHIKI_LANGUAGE_ALIASES: Record<string, string> = {
  "c#": "csharp",
  "cs": "csharp",
  "sh": "bash",
  "shell": "bash",
  "shellscript": "bash",
  "yml": "yaml",
  "md": "markdown",
  "py": "python",
  "rb": "ruby",
  "ps1": "powershell",
  "bat": "batch",
  "js": "javascript",
  "ts": "typescript",
  "env": "dotenv",
  "plaintext": "text",
  "plain": "text",
  "txt": "text",
};

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeShikiLang(lang: string): string {
  const v = lang.toLowerCase();
  return SHIKI_LANGUAGE_ALIASES[v] ?? v;
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

type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighter>>;
type HighlighterBundle = {
  highlighter: ShikiHighlighter;
  dark: string;
  light: string;
  loadedLangs: Set<string>;
  failedLangs: Set<string>;
};

const highlighterCache = new Map<string, Promise<HighlighterBundle>>();

type ShikiPluginConfig = {
  enable?: boolean;
};

function readShikiPluginConfig(config: Config): ShikiPluginConfig {
  const raw = config.plugins?.config?.["shiki"];
  return (raw && typeof raw === "object" ? raw : {}) as ShikiPluginConfig;
}

function highlighterKey(dark: string, light: string): string {
  return `${light}::${dark}`;
}

async function getHighlighterBundle(themeDark: string, themeLight: string): Promise<HighlighterBundle> {
  const dark = normalizeShikiTheme((themeDark || "github-dark").trim()) || "github-dark";
  const light = normalizeShikiTheme((themeLight || "github-light").trim()) || "github-light";
  const key = highlighterKey(dark, light);
  const cached = highlighterCache.get(key);
  if (cached) return await cached;

  const created = (async (): Promise<HighlighterBundle> => {
    try {
      const highlighter = await createHighlighter({ themes: [light, dark] });
      return {
        highlighter,
        dark,
        light,
        loadedLangs: new Set<string>(),
        failedLangs: new Set<string>(),
      };
    } catch {
      const highlighter = await createHighlighter({ themes: ["github-light", "github-dark"] });
      return {
        highlighter,
        dark: "github-dark",
        light: "github-light",
        loadedLangs: new Set<string>(),
        failedLangs: new Set<string>(),
      };
    }
  })();

  highlighterCache.set(key, created);
  return await created;
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

// [OPT-5] 移除不必要的 Promise.resolve() 包裝，codeToHtml 本身為同步呼叫
function renderShikiFenceSync(
  bundle: HighlighterBundle,
  code: string,
  lang: string,
): string | null {
  const normalizedLang = normalizeShikiLang(lang);
  const normalizedCode = trimFenceTerminalEol(code);
  try {
    const shikiHtml = (bundle.highlighter as unknown as { codeToHtml: (...args: any[]) => string })
      .codeToHtml(normalizedCode, {
        lang: normalizedLang,
        themes: { dark: bundle.dark, light: bundle.light },
      });
    return patchShikiFenceHtml(shikiHtml, lang);
  } catch {
    return null;
  }
}

function extractLanguage(codeClass: string | undefined): string | null {
  if (!codeClass) return null;
  const match = codeClass.match(/\blanguage-([^\s]+)/);
  return match?.[1] ?? null;
}

async function loadLanguageSafe(
  bundle: HighlighterBundle,
  loader: (lang: string) => Promise<void>,
  lang: string,
): Promise<void> {
  try {
    await loader(lang);
    bundle.loadedLangs.add(lang);
  } catch {
    bundle.failedLangs.add(lang);
    console.warn(`[WARN] Shiki language load failed: "${lang}". Fallback to text for affected blocks.`);
  }
}

export const shikiPlugin: Plugin = {
  name: "shiki",

  registerCli(program) {
    const parseHighlightMode = (raw: string): "off" => {
      const v = String(raw ?? "").trim().toLowerCase();
      if (v === "off") return "off";
      throw new Error("Invalid value for --code-highlight. Use off.");
    };
    program.option(
      "--code-highlight <off>",
      "Disable syntax highlighting (use --code-highlight=off)",
      parseHighlightMode,
    );
  },

  cliToConfig(opts, out) {
    const raw = opts["codeHighlight"];
    if (String(raw ?? "").toLowerCase() !== "off") return;
    const prevPlugins = out.plugins ?? {};
    const prevConfig = prevPlugins.config ?? {};
    const prevShiki = (prevConfig["shiki"] ?? {}) as Record<string, unknown>;
    out.plugins = {
      ...prevPlugins,
      config: {
        ...prevConfig,
        shiki: { ...prevShiki, enable: false },
      },
    };
  },

  isEnabled: (config) => readShikiPluginConfig(config).enable ?? true,

  async processHtml(html, config, context) {
    const $ = load(html, {}, false);
    const codeNodes = $("pre > code").toArray();
    const typeName = config.template_variant || "default";
    const defaultTypeCfg = context.templateData?.config?.types?.default;
    const typeCfg = context.templateData?.config?.types?.[typeName];
    const shikiCfgDefault = defaultTypeCfg?.code?.Shiki ?? context.templateData?.config?.code?.Shiki;
    const shikiCfgVariant = typeCfg?.code?.Shiki;

    const themeDark = shikiCfgVariant?.dark ?? shikiCfgDefault?.dark ?? "github-dark";
    const themeLight = shikiCfgVariant?.light ?? shikiCfgDefault?.light ?? "github-light";
    const autoDetect = shikiCfgVariant?.auto_detect ?? shikiCfgDefault?.auto_detect ?? true;

    const bundle = await getHighlighterBundle(themeDark, themeLight);

    type FenceEntry = {
      preEl: ReturnType<typeof $>;
      codeText: string;
      lang: string;
      normalizedLang: string;
      oldAttrs: Record<string, string | undefined>;
    };

    const fences: FenceEntry[] = [];
    const neededLangs = new Set<string>();

    for (const node of codeNodes) {
      const codeEl = $(node);
      const preEl = codeEl.parent("pre");
      if (!preEl.length) continue;
      if (preEl.hasClass("shiki")) continue;

      let lang = extractLanguage(codeEl.attr("class"));
      const codeText = codeEl.text();

      // [OPT-3] 限制 auto-detect 範圍：白名單語言 + 字元數上限
      if (!lang && autoDetect && codeText.length <= HLJS_AUTO_DETECT_MAX_CHARS) {
        try {
          lang = hljs.highlightAuto(codeText, HLJS_AUTO_DETECT_LANGUAGES).language ?? null;
        } catch {
          lang = null;
        }
      }

      if (!lang) lang = "text";

      const normalizedLang = normalizeShikiLang(lang);
      neededLangs.add(normalizedLang);

      fences.push({
        preEl,
        codeText,
        lang,
        normalizedLang,
        oldAttrs: (preEl.attr() ?? {}) as Record<string, string | undefined>,
      });
    }

    // [OPT-1] 語言載入改為並行，原本為逐一 await 的串行迴圈
    const loader = (bundle.highlighter as unknown as { loadLanguage?: (lang: string) => Promise<void> }).loadLanguage;
    if (typeof loader === "function") {
      const langsToLoad = [...neededLangs].filter(
        (l) => !bundle.loadedLangs.has(l) && !bundle.failedLangs.has(l),
      );

      await Promise.allSettled(
        langsToLoad.map((l) => loadLanguageSafe(bundle, (x) => loader.call(bundle.highlighter, x), l)),
      );
    }

    // [OPT-2] fence 渲染改為並行，原本為逐一 await 的串行迴圈
    // renderShikiFenceSync 已改為同步，Promise.all 用於並行收集結果
    const renderResults = await Promise.all(
      fences.map(async (fence): Promise<{ fence: FenceEntry; rendered: string | null }> => {
        // [OPT-5] 直接呼叫同步版本，不再包裹 Promise.resolve()
        let rendered = renderShikiFenceSync(bundle, fence.codeText, fence.lang);
        if (!rendered && fence.lang !== "text") {
          rendered = renderShikiFenceSync(bundle, fence.codeText, "text");
        }
        return { fence, rendered };
      }),
    );

    // [OPT-4] Cheerio fragment 解析集中於此迴圈；DOM 替換保持原始順序
    for (const { fence, rendered } of renderResults) {
      if (!rendered) continue;

      const $frag = load(rendered, {}, false);
      const newPre = $frag("pre").first();
      if (!newPre.length) continue;

      for (const [k, v] of Object.entries(fence.oldAttrs)) {
        if (newPre.attr(k) === undefined) newPre.attr(k, v);
      }

      fence.preEl.replaceWith(newPre);
    }

    return $.html() || html;
  },

  // [OPT-6] 直接回傳模組常數，不再每次建構字串
  getAssets(): PluginAssets {
    return { css: SHIKI_THEME_ADAPTER_CSS };
  },
};

export interface ShikiOptions {
  /** Enable/disable highlighting. */
  enable?: boolean;
  /** Optional template data for theme lookup (types.<variant>.code.Shiki.*). */
  templateData?: TemplateData;
  /** Source directory passed to plugin context. */
  sourceDir?: string;
  /** Advanced override for full config control. */
  config?: Partial<Config>;
}

function resolveShikiConfig(options: ShikiOptions = {}): Config {
  const enable = options.enable ?? true;
  const plugins = options.config?.plugins ?? {};
  const pluginConfig = plugins.config ?? {};
  const shiki = (pluginConfig["shiki"] ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_CONFIG,
    ...options.config,
    plugins: {
      ...plugins,
      config: {
        ...pluginConfig,
        shiki: { ...shiki, enable },
      },
    },
  };
}

/** Convenience transformer: `result = await shiki(result)` */
export async function shiki(html: string, options: ShikiOptions = {}): Promise<string> {
  const config = resolveShikiConfig(options);
  if (!shikiPlugin.isEnabled(config) || !shikiPlugin.processHtml) return html;
  return await shikiPlugin.processHtml(html, config, {
    sourceDir: options.sourceDir ?? "",
    templateData: options.templateData,
  });
}

/** Plugin CSS assets for host template injection. */
export async function shikiAssets(options: ShikiOptions = {}): Promise<PluginAssets> {
  const config = resolveShikiConfig(options);
  if (!shikiPlugin.isEnabled(config) || !shikiPlugin.getAssets) return {};
  return await shikiPlugin.getAssets(config);
}
