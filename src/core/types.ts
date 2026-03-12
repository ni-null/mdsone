// ============================================================
// src/core/types.ts — 所有共用 TypeScript 介面與型別
// 核心層零依賴：不引用任何 Node.js / runtime API
// ============================================================

/** 完整設定物件（對應 Python CONFIG dict） */
export interface Config {
  // paths
  markdown_source_dir: string;
  output_file: string;
  output_dir: string;
  output_filename: string;
  templates_dir: string;
  locales_dir: string;
  // build
  default_template: string;
  minify_html: boolean;
  markdown_extensions: string[];
  template_config_file: string;
  build_date: string;
  // site
  site_title: string;
  theme_mode: "light" | "dark" | string;
  // i18n
  locale: string;
  i18n_mode: boolean;
  default_locale: string;
  // advanced
  img_to_base64: boolean;
  img_max_width: number;
  img_compress: number;
  // code features
  code_highlight: boolean;
  code_copy: boolean;
  code_highlight_theme: string;
  code_highlight_theme_light: string;
}

/** CLI 引數物件（commander 解析後） */
export interface CliArgs {
  template?: string;
  locale?: string;
  output?: string;
  source?: string;
  outputDir?: string;
  outputFilename?: string;
  siteTitle?: string;
  themeMode?: string;
  i18nMode?: string;
  defaultLocale?: string;
  minifyHtml?: string;
  templatesDir?: string;
  localesDir?: string;
  imgToBase64?: string;
  imgMaxWidth?: string;
  imgCompress?: string;
  codeHighlight?: string;
  codeCopy?: string;
  codeHighlightTheme?: string;
  codeHighlightThemeLight?: string;
  version?: boolean;
}

/** locale JSON 檔案的結構（en.json / zh-TW.json） */
export interface I18nFile {
  _comment?: string;
  _locale?: string;
  cli: Record<string, string>;
  /** template 區塊現由各模板的 locales/ 提供，全域檔案可省略 */
  template?: Record<string, string>;
}

/** 單一文件項目（對應 mdsone_DATA.docs[n]） */
export interface DocItem {
  id: string;
  title: string;
  name: string;
  html: string;
}

/** TOC 設定 */
export interface TocConfig {
  enabled: boolean;
  levels: number[];
}

/** Template config.json 中 _metadata 物件 */
export interface TemplateMetadata {
  name?: string;
  description?: string;
  version?: string;
  schema_version?: string;
  author?: string;
}

/** template_loader 載入後的完整模板資料（含已讀取的檔案內容） */
export interface TemplateData {
  /** style.css 原始文字 */
  css: string;
  /** template.html 原始文字（含 {PLACEHOLDER}）*/
  template: string;
  /**
   * assets/ 資料夾中依數字前綴排序的 CSS 檔案清單（已讀入內容）
   * 建置時以 <style> inline 注入 {EXTRA_CSS}
   */
  assets_css: Array<{ filename: string; content: string }>;
  /**
   * assets/ 資料夾中依數字前綴排序的 JS 檔案清單（已讀入內容）
   * 建置時以 <script> inline 注入 {EXTRA_JS}
   */
  assets_js: Array<{ filename: string; content: string }>;
  version: string;
  schema_version: string;
  metadata: TemplateMetadata;
  toc_config: TocConfig;
}

/** buildHtml() 的輸入型別 */
export interface BuildParams {
  config: Config;
  /** 單語模式：{ tab_name: html } */
  documents?: Record<string, string>;
  /** 多語模式：{ locale: { tab_name: html } } */
  multiDocuments?: Record<string, Record<string, string>>;
  templateData: TemplateData;
  /** 單語 i18n 字串（來自 getAllTemplateStrings） */
  i18nStrings?: Record<string, string>;
  /** 多語 i18n 字串 { locale: { key: val } } */
  multiI18nStrings?: Record<string, Record<string, string>>;
  /** 從 lib/ 組裝的樣式標籤（插入 {LIB_CSS}） */
  libCss?: string;
  /** 從 lib/ 組裝的腳本標籤（插入 {LIB_JS}） */
  libJs?: string;
}

/** validateConfig() 的回傳型別 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── mdsone_DATA 結構（注入至 HTML 的 JSON payload）──

/** 單語模式的 mdsone_DATA */
export interface mdsoneDataSingle {
  docs: DocItem[];
  config: mdsoneConfigPayload;
  i18n: Record<string, string>;
}

/** 多語模式的 mdsone_DATA */
export interface mdsoneDataMulti {
  locales: string[];
  defaultLocale: string;
  docs: Record<string, DocItem[]>;
  config: mdsoneConfigPayload;
  i18n: Record<string, Record<string, string>>;
}

export type mdsoneData = mdsoneDataSingle | mdsoneDataMulti;

/** mdsone_DATA.config 段落 */
export interface mdsoneConfigPayload {
  site_title: string;
  theme_mode: string;
  build_date: string;
  toc: TocConfig;
}
