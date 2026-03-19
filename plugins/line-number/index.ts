// ============================================================
// plugins/line-number/index.ts — Line number plugin
//
// Cheerio removed: Markdown-rendered <pre><code> structure is
// fixed and predictable, so regex + string operations suffice.
// ============================================================

import type { Config, Plugin, PluginAssets } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { getLineNumberStyle } from "./line-number.js";

// [OPT] Hoist to module constant — getLineNumberStyle() is pure and static.
const LINE_NUMBER_CSS = `<style id="mdsone-line-number">\n${getLineNumberStyle()}\n</style>`;

// Matches <pre ...><code ...>...</code></pre> across newlines.
// Group 1: pre attributes (may be empty)
// Group 2: code attributes (may be empty)
// Group 3: raw inner HTML of the <code> element
const PRE_CODE_RE = /<pre([^>]*)>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;

type LineNumberPluginConfig = { enable?: boolean };

function readLineNumberPluginConfig(config: Config): LineNumberPluginConfig {
  const raw = config.plugins?.config?.["line_number"];
  return (raw && typeof raw === "object" ? raw : {}) as LineNumberPluginConfig;
}

// ---------------------------------------------------------------------------
// Attribute string helpers (replace Cheerio's addClass / attr)
// ---------------------------------------------------------------------------

/**
 * Append a CSS class to a raw HTML attribute string.
 * Handles both "class already exists" and "no class attribute" cases.
 */
function addClassToAttrs(attrs: string, cls: string): string {
  if (new RegExp(`\\b${cls}\\b`).test(attrs)) return attrs;
  if (/\bclass=/.test(attrs)) {
    return attrs.replace(/\bclass=(["'])(.*?)\1/, (_m, q, existing) => `class=${q}${existing} ${cls}${q}`);
  }
  return `${attrs} class="${cls}"`;
}

/**
 * Add key="value" to a raw attribute string if the key is absent.
 */
function addAttrIfMissing(attrs: string, key: string, value: string): string {
  if (new RegExp(`\\b${key}=`).test(attrs)) return attrs;
  return `${attrs} ${key}="${value}"`;
}

// ---------------------------------------------------------------------------
// Line-number injection helpers
// ---------------------------------------------------------------------------

/**
 * Trim a single trailing empty entry — mirrors the original
 * trimTrailingEmpty() used in the Cheerio version.
 */
function trimTrailingEmpty(lines: string[]): string[] {
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

/**
 * Case A — inner HTML already contains Shiki `.code-line` spans.
 * Wraps each span's content with number + content spans,
 * skipping any that already contain `.code-line-number`.
 */
function injectIntoWrapped(innerHtml: string): string {
  let idx = 0;
  return innerHtml.replace(
    /(<span[^>]*\bcode-line\b[^>]*>)([\s\S]*?)(<\/span>)/g,
    (_match, open, content, close) => {
      if (content.includes("code-line-number")) return _match;
      const num = ++idx;
      return (
        `${open}` +
        `<span class="code-line-number">${num}</span>` +
        `<span class="code-line-content">${content || "\u200b"}</span>` +
        `${close}`
      );
    },
  );
}

/**
 * Case B — plain Markdown output, newline-delimited inner HTML.
 * Splits on "\n" and wraps each line with the full code-line structure.
 */
function injectIntoPlain(innerHtml: string): string {
  return trimTrailingEmpty(innerHtml.split("\n"))
    .map(
      (lineHtml, idx) =>
        `<span class="code-line">` +
        `<span class="code-line-number">${idx + 1}</span>` +
        `<span class="code-line-content">${lineHtml || "\u200b"}</span>` +
        `</span>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Per-block processor — called once per regex match
// ---------------------------------------------------------------------------

function processPreBlock(
  fullMatch: string,
  preAttrs: string,
  codeAttrs: string,
  innerHtml: string,
): string {
  // Skip blocks already processed by a previous pass
  if (/\bdata-line-number-ready\b/.test(preAttrs)) return fullMatch;

  const isWrapped =
    innerHtml.includes('class="code-line"') || innerHtml.includes("class='code-line'");

  const newInner = isWrapped ? injectIntoWrapped(innerHtml) : injectIntoPlain(innerHtml);

  let newPreAttrs = addClassToAttrs(preAttrs, "mdsone-line-number");
  newPreAttrs = addAttrIfMissing(newPreAttrs, "data-line-number-ready", "1");

  return `<pre${newPreAttrs}><code${codeAttrs}>${newInner}</code></pre>`;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const lineNumberPlugin: Plugin = {
  name: "line_number",

  registerCli(program) {
    const parseMode = (raw: string): "off" => {
      const v = String(raw ?? "").trim().toLowerCase();
      if (v === "off") return "off";
      throw new Error("Invalid value for --code-line-number. Use off.");
    };
    program.option(
      "--code-line-number [off]",
      "Show line numbers in code blocks (use --code-line-number or --code-line-number=off)",
      parseMode,
    );
  },

  cliToConfig(opts, out) {
    const raw = opts["codeLineNumber"];
    const previous = out.plugins ?? {};
    const prevConfig = previous.config ?? {};
    const prevLineNumber = (prevConfig["line_number"] ?? {}) as Record<string, unknown>;
    if (raw === true) {
      out.plugins = {
        ...previous,
        config: {
          ...prevConfig,
          line_number: { ...prevLineNumber, enable: true },
        },
      };
    } else if (typeof raw === "string") {
      const v = raw.toLowerCase();
      if (v === "off") {
        out.plugins = {
          ...previous,
          config: {
            ...prevConfig,
            line_number: { ...prevLineNumber, enable: false },
          },
        };
      }
    }
  },

  isEnabled: (config) => readLineNumberPluginConfig(config).enable === true,

  // [OPT] Cheerio removed — single regex replace, no DOM parse/serialize.
  //       processHtml is now fully synchronous with no allocations beyond
  //       the output string itself.
  processHtml(html) {
    PRE_CODE_RE.lastIndex = 0;
    return html.replace(PRE_CODE_RE, processPreBlock);
  },

  // [OPT] Return pre-built module constant, no work done at call time.
  getAssets(): PluginAssets {
    return { css: LINE_NUMBER_CSS };
  },
};

// ---------------------------------------------------------------------------
// Public API (unchanged signatures)
// ---------------------------------------------------------------------------

export interface LineNumberOptions {
  /** true to enable line numbers, false to disable. */
  enable?: boolean;
  /** Advanced override for full config control. */
  config?: Partial<Config>;
}

function resolveLineNumberConfig(options: LineNumberOptions = {}): Config {
  const enable = options.enable ?? true;
  const plugins = options.config?.plugins ?? {};
  const pluginConfig = plugins.config ?? {};
  const lineNumber = (pluginConfig["line_number"] ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_CONFIG,
    ...options.config,
    plugins: {
      ...plugins,
      config: {
        ...pluginConfig,
        line_number: { ...lineNumber, enable },
      },
    },
  };
}

/** Convenience transformer: `result = await lineNumber(result)` */
export async function lineNumber(html: string, options: LineNumberOptions = {}): Promise<string> {
  const config = resolveLineNumberConfig(options);
  if (!lineNumberPlugin.isEnabled(config) || !lineNumberPlugin.processHtml) return html;
  return await lineNumberPlugin.processHtml(html, config, { sourceDir: "" });
}

/** Plugin CSS assets for host template injection. */
export async function lineNumberAssets(options: LineNumberOptions = {}): Promise<PluginAssets> {
  const config = resolveLineNumberConfig(options);
  if (!lineNumberPlugin.isEnabled(config) || !lineNumberPlugin.getAssets) return {};
  return await lineNumberPlugin.getAssets(config);
}
