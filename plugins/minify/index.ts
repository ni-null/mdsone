// ============================================================
// plugins/minify/index.ts — Final output minify plugin
//
// Runs on full-page HTML after buildHtml().
// Uses html-minifier-terser to minify HTML + inline CSS + JS.
// ============================================================

import type { Config, Plugin } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";

const DEFAULT_MINIFY_OPTIONS = {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
};

type HtmlMinifierModule = typeof import("html-minifier-terser");
let minifierModulePromise: Promise<HtmlMinifierModule> | null = null;

async function loadMinifierModule(): Promise<HtmlMinifierModule> {
  if (!minifierModulePromise) {
    minifierModulePromise = import("html-minifier-terser");
  }
  return await minifierModulePromise;
}

export const minifyPlugin: Plugin = {
  name: "minify",

  registerCli(program) {
    const parseMode = (raw: string): "off" => {
      const v = String(raw ?? "").trim().toLowerCase();
      if (v === "off") return "off";
      throw new Error("Invalid value for --minify. Use --minify or --minify=off.");
    };
    program.option(
      "--minify [off]",
      "Minify output HTML (default: off; use --minify or --minify=off)",
      parseMode,
    );
  },

  cliToConfig(opts, out) {
    const raw = opts["minify"];
    const previous = out.plugins ?? {};
    const prevConfig = previous.config ?? {};
    const prevMinify = (prevConfig["minify"] ?? {}) as Record<string, unknown>;
    if (raw === true) {
      out.plugins = {
        ...previous,
        config: {
          ...prevConfig,
          minify: { ...prevMinify, enable: true },
        },
      };
    } else if (typeof raw === "string") {
      const v = raw.toLowerCase();
      if (v === "off") {
        out.plugins = {
          ...previous,
          config: {
            ...prevConfig,
            minify: { ...prevMinify, enable: false },
          },
        };
      }
    }
  },

  isEnabled: (config) => {
    const minify = config.plugins?.config?.["minify"] as { enable?: boolean } | undefined;
    return minify?.enable === true;
  },
  async processOutputHtml(html) {
    const mod = await loadMinifierModule();
    return await mod.minify(html, DEFAULT_MINIFY_OPTIONS);
  },
};

export interface MinifyOptions {
  /** true: enable; false: disable */
  enable?: boolean;
  /** Advanced override for full config control. */
  config?: Partial<Config>;
}

function resolveMinifyConfig(options: MinifyOptions = {}): Config {
  const enable = options.enable ?? true;
  const plugins = options.config?.plugins ?? {};
  const pluginConfig = plugins.config ?? {};
  const minify = (pluginConfig["minify"] ?? {}) as Record<string, unknown>;
  return {
    ...DEFAULT_CONFIG,
    ...options.config,
    plugins: {
      ...plugins,
      config: {
        ...pluginConfig,
        minify: { ...minify, enable },
      },
    },
  };
}

/** Convenience transformer for full-page HTML. */
export async function minifyOutput(html: string, options: MinifyOptions = {}): Promise<string> {
  const config = resolveMinifyConfig(options);
  if (!minifyPlugin.isEnabled(config) || !minifyPlugin.processOutputHtml) return html;
  return await minifyPlugin.processOutputHtml(html, config);
}
