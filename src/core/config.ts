// ============================================================
// src/core/config.ts — Config 預設值與不可變合併函式
// 核心層：不讀任何檔案，不依賴 Node.js API
// ============================================================

import type { Config, CliArgs } from "./types.js";

/** 對應 Python CONFIG dict 的所有預設值 */
export const DEFAULT_CONFIG: Config = {
  // paths
  markdown_source_dir: "./markdown",
  output_file: "main.html",
  templates_dir: "templates",
  locales_dir: "locales",
  // build
  default_template: "normal",
  markdown_extensions: ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"],
  build_date: "",
  // site
  site_title: "Documentation",
  theme_mode: "light",
  // i18n
  locale: "en",
  i18n_mode: false,
  default_locale: "",
  template_variant: "default",
};

/**
 * 合併多層設定（純函數，回傳新物件，不改原有物件）。
 * 優先序：CLI args > env > toml > defaults
 * Node adapter 的 config_loader.ts 負責將各層原始值轉為 Partial<Config>，
 * 再傳入此函式做最終合併。
 */
export function mergeConfigs(
  defaults: Config,
  toml: Partial<Config>,
  env: Partial<Config>,
  cli: Partial<Config>,
): Config {
  const merged = {
    ...defaults,
    ...filterDefined(toml),
    ...filterDefined(env),
    ...filterDefined(cli),
  } as Config;

  const plugins = mergePluginSettings(
    defaults.plugins,
    toml.plugins,
    env.plugins,
    cli.plugins,
  );
  if (plugins) merged.plugins = plugins;
  else delete merged.plugins;

  return merged;
}

/** 將 undefined 值的 key 濾除，避免覆蓋較低優先序的值 */
function filterDefined<T extends object>(obj: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

function mergePluginSettings(
  ...layers: Array<Config["plugins"] | undefined>
): Config["plugins"] | undefined {
  const merged: NonNullable<Config["plugins"]> = {};
  let hasAny = false;
  for (const layer of layers) {
    if (!layer) continue;
    hasAny = true;
    if (layer.order) merged.order = [...layer.order];
    if (layer.config) {
      const prev = merged.config ?? {};
      const next = { ...prev };
      for (const [pluginName, cfg] of Object.entries(layer.config)) {
        const before = next[pluginName] ?? {};
        next[pluginName] = { ...before, ...cfg };
      }
      merged.config = next;
    }
  }
  return hasAny ? merged : undefined;
}

/**
 * 將 CLI args（CliArgs 格式）對映至 Partial<Config>。
 * 純函數，僅轉換型別，不讀環境或檔案。
 */
export function cliArgsToConfig(args: CliArgs): Partial<Config> {
  const out: Partial<Config> = {};
  // Templates & Styling
  if (args.template) out.default_template = args.template;
  if (args.siteTitle) out.site_title = args.siteTitle;
  // Internationalization
  if (typeof args.i18nMode === "string") {
    const modeValue = args.i18nMode.trim();
    const lower = modeValue.toLowerCase();
    if (lower === "false") {
      out.i18n_mode = false;
    } else {
      out.i18n_mode = true;
      if (modeValue && lower !== "true") out.default_locale = modeValue;
    }
  } else if (args.i18nMode) {
    out.i18n_mode = true;
  }
  // Plugin CLI overrides
  if (args.pluginOverrides) Object.assign(out, args.pluginOverrides);
  return out;
}
