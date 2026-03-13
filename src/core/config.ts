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
  output_dir: "",
  output_filename: "",
  templates_dir: "templates",
  locales_dir: "locales",
  // build
  default_template: "normal",
  minify_html: true,
  markdown_extensions: ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"],
  template_config_file: "template.config.json",
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
  if (args.source) out.markdown_source_dir = args.source;
  if (args.output) out.output_file = args.output;
  if (args.outputDir) out.output_dir = args.outputDir;
  if (args.outputFilename) out.output_filename = args.outputFilename;
  if (args.templatesDir) out.templates_dir = args.templatesDir;
  if (args.localesDir) out.locales_dir = args.localesDir;
  // Templates & Styling
  if (args.template) out.default_template = args.template;
  if (args.siteTitle) out.site_title = args.siteTitle;
  if (args.themeMode) out.theme_mode = args.themeMode;
  if (args.minifyHtml !== undefined) {
    out.minify_html = ["true", "1", "yes", "on"].includes(args.minifyHtml!.toLowerCase());
  }
  // Internationalization
  if (args.locale) out.locale = args.locale;
  if (args.i18nMode !== undefined) {
    out.i18n_mode = ["true", "1", "yes", "on"].includes(args.i18nMode!.toLowerCase());
  }
  if (args.defaultLocale) out.default_locale = args.defaultLocale;
  // Image Processing
  if (args.imgToBase64 !== undefined) {
    out.img_to_base64 = ["true", "1", "yes", "on"].includes(args.imgToBase64!.toLowerCase());
  }
  if (args.imgMaxWidth !== undefined && args.imgMaxWidth !== "") {
    const w = parseInt(args.imgMaxWidth, 10);
    if (!isNaN(w) && w > 0) out.img_max_width = w;
  }
  if (args.imgCompress !== undefined && args.imgCompress !== "") {
    const q = parseInt(args.imgCompress, 10);
    if (!isNaN(q)) out.img_compress = Math.max(1, Math.min(100, q));
  }
  // Code features
  if (args.codeHighlight !== undefined) {
    out.code_highlight = !["disable", "false", "0", "off"].includes(args.codeHighlight.toLowerCase());
  }
  if (args.codeCopy !== undefined) {
    out.code_copy = !["disable", "false", "0", "off"].includes(args.codeCopy.toLowerCase());
  }
  if (args.codeHighlightTheme) out.code_highlight_theme = args.codeHighlightTheme;
  if (args.codeHighlightThemeLight) out.code_highlight_theme_light = args.codeHighlightThemeLight;
  return out;
}

/**
 * 解析 output_file：若 output_dir + output_filename 已設定且 --output 未明確提供，
 * 組合出完整路徑（純字串操作，不呼叫 path 模組）。
 * 平台分隔符由呼叫方提供（Node adapter 傳入 path.join）。
 */
export function resolveOutputFile(
  config: Config,
  outputExplicit: boolean,
  joinFn: (...parts: string[]) => string,
): string {
  if (outputExplicit) return config.output_file;
  if (config.output_dir || config.output_filename) {
    const dir = config.output_dir || getDirname(config.output_file);
    const name = config.output_filename || getBasename(config.output_file);
    return joinFn(dir, name);
  }
  return config.output_file;
}

function getDirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(0, idx) || "." : ".";
}

function getBasename(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx >= 0 ? p.slice(idx + 1) : p;
}
