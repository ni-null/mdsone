// ============================================================
// plugins/katex/index.ts - KaTeX math plugin
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type MarkdownIt from "markdown-it";
import type { Config, Plugin, PluginAssets } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

const require = createRequire(import.meta.url);

type KatexPluginConfig = {
  enable?: boolean;
  mode?: unknown;
};

type KatexMode = "woff2" | "full";
const katexCssCache = new Map<KatexMode, string>();
const katexCssTried = new Set<KatexMode>();
let cachedKatexMarkdownPlugin: ((...args: unknown[]) => unknown) | null = null;

function readKatexPluginConfig(config: Config): KatexPluginConfig {
  const raw = config.plugins?.config?.["katex"];
  return (raw && typeof raw === "object" ? raw : {}) as KatexPluginConfig;
}

function normalizeKatexMode(mode: unknown): KatexMode {
  return mode === "full" ? "full" : "woff2";
}

function getFontMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".woff") return "font/woff";
  if (ext === ".ttf") return "font/ttf";
  return "application/octet-stream";
}

function keepOnlyWoff2FontSources(css: string): string {
  return css.replace(/@font-face\s*{[\s\S]*?}/g, (block) => {
    const srcMatch = block.match(/src\s*:\s*([^;]+);/);
    if (!srcMatch) return block;

    const rawSources = srcMatch[1];
    const sourceItems = rawSources
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const woff2Items = sourceItems.filter((item) => /\.woff2(?:[\?#][^)]*)?/i.test(item));

    if (woff2Items.length === 0) return block;
    return block.replace(srcMatch[0], `src:${woff2Items.join(",")};`);
  });
}

function inlineKatexFontUrls(css: string, distDir: string, mode: KatexMode): string {
  const cache = new Map<string, string>();
  return css.replace(/url\((['"]?)(fonts\/[^)"']+)\1\)/g, (_m, quote: string, relPath: string) => {
    const normalizedRel = relPath.split("?")[0].split("#")[0];
    if (mode === "woff2" && !/\.woff2$/i.test(normalizedRel)) {
      return `url(${quote}${relPath}${quote})`;
    }
    const absPath = path.join(distDir, normalizedRel);
    if (!cache.has(absPath)) {
      try {
        const fontBuffer = fs.readFileSync(absPath);
        const mime = getFontMimeType(absPath);
        const dataUrl = `data:${mime};base64,${fontBuffer.toString("base64")}`;
        cache.set(absPath, dataUrl);
      } catch {
        return `url(${quote}${relPath}${quote})`;
      }
    }
    return `url(${quote}${cache.get(absPath)!}${quote})`;
  });
}

function resolveKatexDistDir(): string | null {
  // Prefer the same KaTeX package instance used by markdown-it-katex,
  // avoiding CSS/HTML mismatch across different KaTeX major versions.
  try {
    const mdKatexEntry = require.resolve("markdown-it-katex");
    const mdKatexRequire = createRequire(mdKatexEntry);
    const cssEntry = mdKatexRequire.resolve("katex/dist/katex.min.css");
    return path.dirname(cssEntry);
  } catch {
    // ignore and try global fallbacks
  }

  try {
    const cssEntry = require.resolve("katex/dist/katex.min.css");
    return path.dirname(cssEntry);
  } catch {
    // ignore and try fallback
  }
  try {
    const katexEntry = require.resolve("katex");
    const dir = path.dirname(katexEntry);
    if (fs.existsSync(path.join(dir, "katex.min.css"))) return dir;
    if (fs.existsSync(path.join(dir, "dist", "katex.min.css"))) return path.join(dir, "dist");
  } catch {
    // ignore
  }
  return null;
}

function loadKatexCss(mode: KatexMode): string {
  if (katexCssTried.has(mode)) return katexCssCache.get(mode) ?? "";
  katexCssTried.add(mode);
  try {
    const distDir = resolveKatexDistDir();
    if (!distDir) {
      throw new Error("Cannot resolve katex dist directory.");
    }
    const cssPath = path.join(distDir, "katex.min.css");
    const cssRaw = fs.readFileSync(cssPath, "utf-8");
    const cssPrepared = mode === "full" ? cssRaw : keepOnlyWoff2FontSources(cssRaw);
    const cssInlined = inlineKatexFontUrls(cssPrepared, distDir, mode);
    katexCssCache.set(mode, cssInlined);
  } catch (e) {
    katexCssCache.set(mode, "");
    console.warn(
      `[WARN] Plugin "katex" CSS load failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return katexCssCache.get(mode) ?? "";
}

function applyKatexMarkdown(md: MarkdownIt): void {
  if (!cachedKatexMarkdownPlugin) {
    try {
      const mod = require("markdown-it-katex") as { default?: (...args: unknown[]) => unknown };
      cachedKatexMarkdownPlugin = (mod.default ?? mod) as (...args: unknown[]) => unknown;
    } catch (e) {
      console.warn(
        `[WARN] Plugin "katex" markdown-it-katex load failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
  }
  md.use(cachedKatexMarkdownPlugin);
}

const KATEX_LAYOUT_FIX_CSS = [
  ".katex, .katex * { box-sizing: content-box !important; }",
  ".katex * { transition: none !important; }",
].join("\n");

export const katexPlugin: Plugin = {
  name: "katex",

  registerCli(program) {
    const parseMode = (raw: string): "full" => {
      const v = String(raw ?? "").trim().toLowerCase();
      if (v === "full") return "full";
      throw new Error("Invalid value for --katex. Use --katex or --katex=full.");
    };
    program.option(
      "--katex [mode]",
      "Enable KaTeX math rendering (default: woff2; use --katex=full for full fonts)",
      parseMode,
    );
  },

  cliToConfig(opts, out) {
    const raw = opts["katex"];
    if (raw !== true && raw !== "full") return;
    const prevPlugins = out.plugins ?? {};
    const prevConfig = prevPlugins.config ?? {};
    const prevKatex = (prevConfig["katex"] ?? {}) as Record<string, unknown>;
    out.plugins = {
      ...prevPlugins,
      config: {
        ...prevConfig,
        katex: {
          ...prevKatex,
          enable: true,
          mode: raw === "full" ? "full" : "woff2",
        },
      },
    };
  },

  isEnabled: (config) => readKatexPluginConfig(config).enable === true,

  extendMarkdown(md) {
    applyKatexMarkdown(md as MarkdownIt);
  },

  getAssets(config): PluginAssets {
    const mode = normalizeKatexMode(readKatexPluginConfig(config).mode);
    const css = loadKatexCss(mode);
    if (!css) return {};
    return { css: `<style id="mdsone-katex">\n${css}\n${KATEX_LAYOUT_FIX_CSS}\n</style>` };
  },
};

export interface KatexOptions {
  enable?: boolean;
  mode?: KatexMode;
  config?: Partial<Config>;
}

function resolveKatexConfig(options: KatexOptions = {}): Config {
  const enable = options.enable ?? true;
  const plugins = options.config?.plugins ?? {};
  const pluginConfig = plugins.config ?? {};
  const katex = (pluginConfig["katex"] ?? {}) as Record<string, unknown>;
  const mode = options.mode ?? "woff2";
  return {
    ...DEFAULT_CONFIG,
    ...options.config,
    plugins: {
      ...plugins,
      config: {
        ...pluginConfig,
        katex: { ...katex, enable, mode },
      },
    },
  };
}

/** Apply KaTeX markdown-it extension to an existing markdown-it instance. */
export function extendKatexMarkdown(md: MarkdownIt, options: KatexOptions = {}): MarkdownIt {
  const config = resolveKatexConfig(options);
  if (!katexPlugin.isEnabled(config)) return md;
  applyKatexMarkdown(md);
  return md;
}

/** Plugin CSS assets for host template injection. */
export async function katexAssets(options: KatexOptions = {}): Promise<PluginAssets> {
  const config = resolveKatexConfig(options);
  if (!katexPlugin.isEnabled(config) || !katexPlugin.getAssets) return {};
  return await katexPlugin.getAssets(config);
}
