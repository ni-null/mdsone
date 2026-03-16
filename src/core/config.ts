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
  minify_html: true,
  markdown_extensions: ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"],
  build_date: "",
  // site
  site_title: "Documentation",
  theme_mode: "light",
  // i18n
  locale: "en",
  i18n_mode: false,
  default_locale: "",
  // advanced
  img_to_base64: false,
  img_max_width: 0,
  img_compress: 0,
  // code features
  code_highlight: true,
  code_copy: true,
  code_copy_mode: "none",
  code_line_copy: false,
  code_line_number: false,
  code_highlight_theme: "atom-one-dark",
  code_highlight_theme_light: "atom-one-light",
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
  return { ...defaults, ...filterDefined(toml), ...filterDefined(env), ...filterDefined(cli) };
}

/** 將 undefined 值的 key 濾除，避免覆蓋較低優先序的值 */
function filterDefined<T extends object>(obj: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

/**
 * 將 CLI args（CliArgs 格式）對映至 Partial<Config>。
 * 純函數，僅轉換型別，不讀環境或檔案。
 */
export function cliArgsToConfig(args: CliArgs): Partial<Config> {
  const out: Partial<Config> = {};
  // Paths
  if (args.templatesDir) out.templates_dir = args.templatesDir;
  // Templates & Styling
  if (args.template) out.default_template = args.template;
  if (args.siteTitle) out.site_title = args.siteTitle;
  if (args.themeMode) out.theme_mode = args.themeMode;
  if (args.minifyHtml !== undefined) {
    const v = args.minifyHtml!.toLowerCase();
    if (v === "true") out.minify_html = true;
    if (v === "false") out.minify_html = false;
  }
  // Internationalization
  if (args.locale) out.locale = args.locale;
  if (args.i18nMode) out.i18n_mode = true;
  if (args.defaultLocale) out.default_locale = args.defaultLocale;
  // Plugin CLI overrides
  if (args.pluginOverrides) Object.assign(out, args.pluginOverrides);
  return out;
}
