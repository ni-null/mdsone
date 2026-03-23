// ============================================================
// plugins/code-highlight/index.ts
// Shiki highlighter using @shikijs/markdown-exit integration.
// ============================================================

import type MarkdownIt from "markdown-it";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import hljs from "highlight.js";
import { createHighlighter } from "shiki";
import type { Config, Plugin, PluginAssets, TemplateData } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

const SHIKI_THEME_ADAPTER_CSS =
  `<style id="shiki-theme-adapter">` +
  `html[data-theme="dark"] pre.shiki,` +
  `html[data-theme="dark"] pre.shiki code,` +
  `html[data-theme="dark"] pre.shiki span {` +
  `  color: var(--shiki-dark) !important;` +
  `  background-color: var(--shiki-dark-bg) !important;` +
  `  font-style: var(--shiki-dark-font-style) !important;` +
  `  font-weight: var(--shiki-dark-font-weight) !important;` +
  `  text-decoration: var(--shiki-dark-text-decoration) !important;` +
  `}` +
  `</style>`;

const AUTO_DETECT_LANGUAGES = [
  "javascript", "typescript", "python", "bash", "json",
  "css", "html", "sql", "yaml", "java", "go", "rust", "cpp",
];

const PRELOAD_LANGUAGES = [
  "text",
  "toml",
  "javascript", "typescript", "python", "bash", "json",
  "css", "html", "sql", "yaml", "java", "go", "rust", "cpp",
  "markdown", "powershell", "batch", "dotenv",
] as const;

const AUTO_DETECT_MAX_CHARS = 500;

const LANGUAGE_ALIASES: Record<string, string> = {
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

const THEME_ALIASES: Record<string, string> = {
  "atom-one-dark": "one-dark-pro",
  "atom-one-light": "one-light",
  "github": "github-light",
  "github-dark-dimmed": "github-dark",
};

type CodeHighlightPluginConfig = {
  enable?: boolean;
};

type MarkdownItPluginFn = (md: MarkdownIt) => void;
type MarkdownExitFromHighlighter = (
  highlighter: unknown,
  options: Record<string, unknown>,
) => (md: unknown) => void;

type HighlighterBundle = {
  highlighter: Awaited<ReturnType<typeof createHighlighter>>;
  dark: string;
  light: string;
};

const shikiFactoryPromise: { current: Promise<MarkdownExitFromHighlighter | null> | null } = { current: null };
const shikiPluginCache = new Map<string, Promise<MarkdownItPluginFn | null>>();
const highlighterCache = new Map<string, Promise<HighlighterBundle>>();

let warnedPackageMissing = false;
let warnedAsyncHighlight = false;
const SHIKI_STYLE_CACHE_ID = "mdsone-shiki-style-cache";
const SHIKI_STYLE_SELECTOR = "pre.shiki[style], pre.shiki code[style], pre.shiki span[style]";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeShikiTheme(theme: string): string {
  const value = theme.trim().toLowerCase();
  return THEME_ALIASES[value] ?? value;
}

function normalizeShikiLang(lang: string): string {
  const value = lang.trim().toLowerCase();
  return LANGUAGE_ALIASES[value] ?? value;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeInlineStyle(style: string): string {
  const declarations = style
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx === -1) return "";
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!prop || !value) return "";
      return `${prop}:${value}`;
    })
    .filter(Boolean);

  if (declarations.length === 0) return "";
  return `${declarations.join(";")};`;
}

function classNameForInlineStyle(style: string): string {
  const digest = createHash("sha1").update(style).digest("hex").slice(0, 10);
  return `mdsone-shiki-${digest}`;
}

function buildShikiStyleRules(styleToClass: Map<string, string>): string {
  return [...styleToClass.entries()]
    .map(([style, className]) => `.${className}{${style}}`)
    .join("\n");
}

function collectShikiInlineStyles(
  dom: ReturnType<typeof load>,
  styleToClass: Map<string, string>,
): number {
  let changed = 0;
  dom(SHIKI_STYLE_SELECTOR).each((_idx, node) => {
    const el = dom(node);
    const rawStyle = el.attr("style");
    if (!rawStyle) return;

    const normalizedStyle = normalizeInlineStyle(rawStyle);
    if (!normalizedStyle) {
      el.removeAttr("style");
      changed += 1;
      return;
    }

    const className = styleToClass.get(normalizedStyle) ?? classNameForInlineStyle(normalizedStyle);
    styleToClass.set(normalizedStyle, className);
    el.addClass(className);
    el.removeAttr("style");
    changed += 1;
  });
  return changed;
}

function appendShikiStyleRules(
  dom: ReturnType<typeof load>,
  styleToClass: Map<string, string>,
): void {
  if (styleToClass.size === 0) return;
  const ruleText = buildShikiStyleRules(styleToClass);
  const styleHtml = `<style id="${SHIKI_STYLE_CACHE_ID}">\n${ruleText}\n</style>`;
  const existing = dom(`style#${SHIKI_STYLE_CACHE_ID}`);
  if (existing.length > 0) {
    const previous = existing.html() || "";
    existing.html(`${previous}\n${ruleText}`);
  } else {
    const head = dom("head");
    if (head.length > 0) {
      head.append(styleHtml);
    } else {
      dom.root().prepend(styleHtml);
    }
  }
}

function optimizeShikiInlineStylesFragment(
  htmlFragment: string,
  styleToClass: Map<string, string>,
): string {
  const dom = load(htmlFragment, {}, false);
  const changed = collectShikiInlineStyles(dom, styleToClass);
  if (changed === 0) return htmlFragment;
  return dom.root().html() || htmlFragment;
}

function escapeJsonForHtmlScript(json: string): string {
  return json
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function optimizeEmbeddedDocsJson(dom: ReturnType<typeof load>, styleToClass: Map<string, string>): boolean {
  const script = dom('script#mdsone-data[type="application/json"]');
  if (script.length === 0) return false;

  const raw = script.html() || "";
  if (!raw.trim()) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  let changed = false;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;

    const obj = value as Record<string, unknown>;
    for (const [key, current] of Object.entries(obj)) {
      if (key === "html" && typeof current === "string") {
        const optimized = optimizeShikiInlineStylesFragment(current, styleToClass);
        if (optimized !== current) {
          obj[key] = optimized;
          changed = true;
        }
        continue;
      }
      visit(current);
    }
  };
  visit(parsed);

  if (!changed) return false;
  script.html(escapeJsonForHtmlScript(JSON.stringify(parsed)));
  return true;
}

function optimizeShikiInlineStyles(html: string): string {
  const doctypeMatch = html.match(/^\s*<!doctype[^>]*>\s*/i);
  const doctype = doctypeMatch?.[0] ?? "";
  const source = doctype ? html.slice(doctype.length) : html;

  const dom = load(source, {}, false);
  const styleToClass = new Map<string, string>();
  const directChanged = collectShikiInlineStyles(dom, styleToClass) > 0;
  const jsonChanged = optimizeEmbeddedDocsJson(dom, styleToClass);
  if (!directChanged && !jsonChanged) return html;

  appendShikiStyleRules(dom, styleToClass);

  const rendered = dom.html() || source;
  return doctype ? `${doctype}${rendered}` : rendered;
}

function patchHighlightedHtml(html: string, lang: string): string {
  const safeLang = escapeHtmlAttr(lang || "text");
  const withDataLang = html.replace(/^<pre([^>]*)>/, (_m, attrs: string) => {
    if (/\bdata-lang=/.test(attrs)) return `<pre${attrs}>`;
    return `<pre${attrs} data-lang="${safeLang}">`;
  });

  return withDataLang.replace(
    /^<pre([^>]*)><code([^>]*)>/,
    (_m, preAttrs: string, codeAttrs: string) => {
      if (/class=/.test(codeAttrs)) {
        return `<pre${preAttrs}><code${codeAttrs.replace(/class=(['"])(.*?)\1/, `class=$1$2 language-${safeLang}$1`)}>`;
      }
      return `<pre${preAttrs}><code class="language-${safeLang}"${codeAttrs}>`;
    },
  );
}

async function loadMarkdownExitFactory(): Promise<MarkdownExitFromHighlighter | null> {
  if (!shikiFactoryPromise.current) {
    shikiFactoryPromise.current = (async () => {
      try {
        const mod = await import("@shikijs/markdown-exit/core");
        const fn = (mod as unknown as { fromHighlighter?: unknown }).fromHighlighter;
        if (typeof fn === "function") {
          return fn as MarkdownExitFromHighlighter;
        }
      } catch {
        // ignore and try package root export
      }

      try {
        const mod = await import("@shikijs/markdown-exit");
        const fn = (mod as unknown as { fromHighlighter?: unknown }).fromHighlighter;
        if (typeof fn === "function") {
          return fn as MarkdownExitFromHighlighter;
        }
      } catch {
        // ignore
      }

      if (!warnedPackageMissing) {
        warnedPackageMissing = true;
        console.warn(
          '[WARN] Plugin "code-highlight" requires @shikijs/markdown-exit. Highlighting is disabled.',
        );
      }

      return null;
    })();
  }

  return await shikiFactoryPromise.current;
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
    const preload = [...new Set(PRELOAD_LANGUAGES.map((x) => normalizeShikiLang(x)))];
    try {
      const highlighter = await createHighlighter({
        themes: [light, dark],
        langs: preload as any,
      });
      return { highlighter, dark, light };
    } catch {
      const highlighter = await createHighlighter({
        themes: ["github-light", "github-dark"],
        langs: preload as any,
      });
      return { highlighter, dark: "github-dark", light: "github-light" };
    }
  })();

  highlighterCache.set(key, created);
  return await created;
}

function readCodeHighlightConfig(config: Config): CodeHighlightPluginConfig {
  const current = asObject(config.plugins?.config?.["code-highlight"]);
  return current as CodeHighlightPluginConfig;
}

function wrapMarkdownItHighlight(md: MarkdownIt): void {
  const opts = md.options as unknown as {
    highlight?: (code: string, lang: string, attrs: string, env?: unknown) => unknown;
  };

  const original = opts.highlight;
  if (typeof original !== "function") return;

  opts.highlight = (code: string, lang: string, attrs: string, env?: unknown): string => {
    const result = original(code, lang, attrs, env);

    if (typeof result !== "string") {
      if (!warnedAsyncHighlight) {
        warnedAsyncHighlight = true;
        console.warn('[WARN] Plugin "code-highlight" received non-string highlight result. Fallback to default fenced rendering.');
      }
      return "";
    }

    return patchHighlightedHtml(result, lang || "text");
  };
}

async function getMarkdownShikiPlugin(themeDark: string, themeLight: string): Promise<MarkdownItPluginFn | null> {
  const dark = normalizeShikiTheme(themeDark || "github-dark") || "github-dark";
  const light = normalizeShikiTheme(themeLight || "github-light") || "github-light";
  const key = `${light}::${dark}`;

  const cached = shikiPluginCache.get(key);
  if (cached) return await cached;

  const pluginPromise = (async (): Promise<MarkdownItPluginFn | null> => {
    const fromHighlighter = await loadMarkdownExitFactory();
    if (!fromHighlighter) return null;

    const bundle = await getHighlighterBundle(dark, light);
    const plugin = fromHighlighter(bundle.highlighter, {
      themes: {
        light: bundle.light,
        dark: bundle.dark,
      },
      defaultLanguage: "text",
      fallbackLanguage: "text",
      trimEndingNewline: true,
      mergeSameStyleTokens: true,
    });

    return (md: MarkdownIt): void => {
      plugin(md as unknown);
      wrapMarkdownItHighlight(md);
    };
  })();

  shikiPluginCache.set(key, pluginPromise);
  return await pluginPromise;
}

function installFenceLanguageRule(md: MarkdownIt, autoDetect: boolean): void {
  const internal = md as unknown as {
    __mdsoneShikiLangRuleInstalled?: boolean;
  };
  if (internal.__mdsoneShikiLangRuleInstalled) return;
  internal.__mdsoneShikiLangRuleInstalled = true;

  md.core.ruler.after("block", "mdsone-code-highlight-fence-lang", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "fence") continue;

      const rawInfo = String(token.info ?? "").trim();
      if (rawInfo) {
        const [lang, ...rest] = rawInfo.split(/\s+/);
        token.info = [normalizeShikiLang(lang), ...rest].join(" ").trim();
        continue;
      }

      const code = String(token.content ?? "");
      if (autoDetect && code.length > 0 && code.length <= AUTO_DETECT_MAX_CHARS) {
        try {
          const detected = hljs.highlightAuto(code, AUTO_DETECT_LANGUAGES).language;
          token.info = normalizeShikiLang(detected ?? "text");
          continue;
        } catch {
          // fallback to text below
        }
      }

      token.info = "text";
    }

    return false;
  });
}

function collectExplicitFenceLanguages(markdownText: string | undefined): string[] {
  if (!markdownText) return [];
  const langs = new Set<string>();
  const fencePattern = /(^|\n)[ \t]*(```+|~~~+)[ \t]*([^\n]*)/g;
  let match: RegExpExecArray | null = null;

  while ((match = fencePattern.exec(markdownText)) !== null) {
    const info = String(match[3] ?? "").trim();
    if (!info) continue;
    const [rawLang] = info.split(/\s+/);
    const lang = normalizeShikiLang(rawLang);
    if (!lang || lang === "text") continue;
    langs.add(lang);
  }

  return [...langs];
}

async function preloadFenceLanguages(
  highlighter: Awaited<ReturnType<typeof createHighlighter>>,
  langs: string[],
): Promise<void> {
  if (langs.length === 0) return;

  const loaded = new Set(
    highlighter.getLoadedLanguages().map((x) => normalizeShikiLang(String(x))),
  );
  const toLoad = [...new Set(langs.map((x) => normalizeShikiLang(x)).filter((x) => !loaded.has(x)))];
  if (toLoad.length === 0) return;

  try {
    await (highlighter as unknown as { loadLanguage: (...l: string[]) => Promise<void> }).loadLanguage(...toLoad);
  } catch {
    // Fallback: best-effort per language.
    const loader = highlighter as unknown as { loadLanguage: (...l: string[]) => Promise<void> };
    for (const lang of toLoad) {
      try {
        await loader.loadLanguage(lang);
      } catch {
        // Ignore unsupported/failed languages.
      }
    }
  }
}

export const codeHighlightPlugin: Plugin = {
  name: "code-highlight",

  registerCli(program) {
    const parseHighlightMode = (raw: string): "off" => {
      const value = String(raw ?? "").trim().toLowerCase();
      if (value === "off") return "off";
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

    const previousPlugins = out.plugins ?? {};
    const previousConfig = previousPlugins.config ?? {};
    const previousCodeHighlight = asObject(previousConfig["code-highlight"]);

    out.plugins = {
      ...previousPlugins,
      config: {
        ...previousConfig,
        "code-highlight": { ...previousCodeHighlight, enable: false },
      },
    };
  },

  isEnabled(config) {
    return readCodeHighlightConfig(config).enable ?? true;
  },

  async extendMarkdown(mdUnknown, config, context) {
    const md = mdUnknown as MarkdownIt;
    if (!md || typeof md.use !== "function") return;

    const typeName = config.template_variant || "default";
    const defaultTypeCfg = context.templateData?.config?.types?.default;
    const typeCfg = context.templateData?.config?.types?.[typeName];
    const shikiCfgDefault = defaultTypeCfg?.code?.Shiki ?? context.templateData?.config?.code?.Shiki;
    const shikiCfgVariant = typeCfg?.code?.Shiki;

    const themeDark = shikiCfgVariant?.dark ?? shikiCfgDefault?.dark ?? "github-dark";
    const themeLight = shikiCfgVariant?.light ?? shikiCfgDefault?.light ?? "github-light";
    const autoDetect = shikiCfgVariant?.auto_detect ?? shikiCfgDefault?.auto_detect ?? true;

    installFenceLanguageRule(md, autoDetect);

    const bundle = await getHighlighterBundle(themeDark, themeLight);
    const explicitFenceLangs = collectExplicitFenceLanguages(context.markdownText);
    if (explicitFenceLangs.length > 0) {
      await preloadFenceLanguages(bundle.highlighter, explicitFenceLangs);
    }

    const shikiPluginForMarkdown = await getMarkdownShikiPlugin(themeDark, themeLight);
    if (!shikiPluginForMarkdown) return;

    md.use(shikiPluginForMarkdown);
    (md as unknown as { __mdsoneSkipFenceWrapper?: boolean }).__mdsoneSkipFenceWrapper = true;
  },

  getAssets(): PluginAssets {
    return { css: SHIKI_THEME_ADAPTER_CSS };
  },

  processOutputHtml(html): string {
    return optimizeShikiInlineStyles(html);
  },
};

export interface CodeHighlightOptions {
  enable?: boolean;
  templateData?: TemplateData;
  sourceDir?: string;
  config?: Partial<Config>;
}

function resolveCodeHighlightConfig(options: CodeHighlightOptions = {}): Config {
  const enable = options.enable ?? true;
  const plugins = options.config?.plugins ?? {};
  const pluginConfig = plugins.config ?? {};
  const codeHighlight = asObject(pluginConfig["code-highlight"]);

  return {
    ...DEFAULT_CONFIG,
    ...options.config,
    plugins: {
      ...plugins,
      config: {
        ...pluginConfig,
        "code-highlight": { ...codeHighlight, enable },
      },
    },
  };
}

/** Apply Shiki markdown extension to an existing markdown-it instance. */
export async function extendCodeHighlightMarkdown(
  md: MarkdownIt,
  options: CodeHighlightOptions = {},
): Promise<MarkdownIt> {
  const config = resolveCodeHighlightConfig(options);
  if (!codeHighlightPlugin.isEnabled(config) || !codeHighlightPlugin.extendMarkdown) return md;

  await codeHighlightPlugin.extendMarkdown(md, config, {
    sourceDir: options.sourceDir ?? "",
    templateData: options.templateData,
  });

  return md;
}

/** Plugin CSS assets for host template injection. */
export async function codeHighlightAssets(options: CodeHighlightOptions = {}): Promise<PluginAssets> {
  const config = resolveCodeHighlightConfig(options);
  if (!codeHighlightPlugin.isEnabled(config) || !codeHighlightPlugin.getAssets) return {};
  return await codeHighlightPlugin.getAssets(config);
}
