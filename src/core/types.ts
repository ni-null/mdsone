// ============================================================
// src/core/types.ts
// Shared TypeScript interfaces for core, adapters, and plugins.
// ============================================================

/** Runtime configuration object. */
export interface Config {
  // paths
  markdown_source_dir: string;
  output_file: string;
  locales_dir: string;
  // build
  template: string;
  markdown?: {
    linkify?: boolean;
    typographer?: boolean;
    breaks?: boolean;
    xhtml_out?: boolean;
  };
  build_date: string;
  // site
  site_title: string;
  theme_mode: "light" | "dark" | string;
  // i18n
  i18n_mode: boolean;
  default_locale: string;
  template_variant: string;
  // plugin settings (optional)
  plugins?: {
    order?: string[];
    config?: Record<string, Record<string, unknown>>;
  };
}

/** Parsed CLI arguments. */
export interface CliArgs {
  inputs?: string[];
  templateDev?: boolean;
  merge?: boolean;
  template?: string;
  output?: string;
  force?: boolean;
  siteTitle?: string;
  i18nMode?: boolean | string;
  configPath?: string;
  markdown?: {
    linkify?: boolean;
    typographer?: boolean;
    breaks?: boolean;
    xhtml_out?: boolean;
  };
  pluginOverrides?: Partial<Config>;
  version?: boolean;
}

/** Locale JSON structure (for example: en.json, zh-TW.json). */
export interface I18nFile {
  _comment?: string;
  _locale?: string;
  cli: Record<string, string>;
  /** Optional template-level strings merged from template locales. */
  template?: Record<string, string>;
}

/** One document entry used by mdsone_DATA.docs. */
export interface DocItem {
  id: string;
  title: string;
  name: string;
  html: string;
}

/** Metadata section in template.config.json. */
export interface TemplateMetadata {
  name?: string;
  description?: string;
  version?: string;
  schema_version?: string;
  author?: string;
}

/** Template-level runtime overrides. */
export interface TemplateRuntimeConfig {
  palette?: string;
  code?: {
    Shiki?: {
      dark?: string;
      light?: string;
      auto_detect?: boolean;
    };
  };
  types?: Record<string, {
    palette?: string;
    code?: {
      Shiki?: {
        dark?: string;
        light?: string;
        auto_detect?: boolean;
      };
    };
  }>;
}

/** Loaded template payload. */
export interface TemplateData {
  /** Raw content of template.html containing placeholders. */
  template: string;
  /** Inline SVG sprite generated from template assets/svg/*.svg. */
  assets_svg_sprite?: string;
  /** Extra CSS files loaded from template assets/. */
  assets_css: Array<{ filename: string; content: string }>;
  /** Extra JS files loaded from template assets/. */
  assets_js: Array<{ filename: string; content: string }>;
  version: string;
  schema_version: string;
  metadata: TemplateMetadata;
  config: TemplateRuntimeConfig;
}

/** Input parameters for buildHtml(). */
export interface BuildParams {
  config: Config;
  /** Single-language docs: { tab_name: html } */
  documents?: Record<string, string>;
  /** Multi-language docs: { locale: { tab_name: html } } */
  multiDocuments?: Record<string, Record<string, string>>;
  templateData: TemplateData;
  /** Single-language template strings. */
  i18nStrings?: Record<string, string>;
  /** Multi-language template strings. */
  multiI18nStrings?: Record<string, Record<string, string>>;
  /** Global locale display-name map loaded from locales/config.json. */
  localeNames?: Record<string, string>;
  /** Aggregated CSS from plugins. */
  libCss?: string;
  /** Aggregated JS from plugins. */
  libJs?: string;
}

/** Validation result container. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Structured validation issue for core/plugin preflight. */
export interface ValidationIssue {
  level: "error" | "warn";
  message: string;
  code?: string;
  plugin?: string;
  hint?: string;
}

// mdsone_DATA payloads embedded into output HTML.

/** Single-language mdsone_DATA shape. */
export interface mdsoneDataSingle {
  docs: DocItem[];
  config: mdsoneConfigPayload;
  i18n: Record<string, string>;
  localeNames?: Record<string, string>;
}

/** Multi-language mdsone_DATA shape. */
export interface mdsoneDataMulti {
  locales: string[];
  defaultLocale: string;
  docs: Record<string, DocItem[]>;
  config: mdsoneConfigPayload;
  i18n: Record<string, Record<string, string>>;
  localeNames?: Record<string, string>;
}

export type mdsoneData = mdsoneDataSingle | mdsoneDataMulti;

/** Config payload embedded in mdsone_DATA.config. */
export interface mdsoneConfigPayload {
  site_title: string;
  theme_mode: string;
  build_date: string;
  template_variant?: string;
  palette?: string;
  types?: Record<string, { palette?: string }>;
}

// Plugin interfaces.

/** CSS/JS assets provided by a plugin. */
export interface PluginAssets {
  /** File-based CSS asset path(s), resolved by plugin asset registry then inlined as <style>. */
  cssFiles?: string[];
  /** File-based JS asset path(s), resolved by plugin asset registry then inlined as <script>. */
  jsFiles?: string[];
}

/** Context passed to plugin DOM hook. */
export interface PluginContext {
  /** Source markdown directory used for relative path resolution. */
  sourceDir: string;
  /** Raw markdown text of current document (available in extendMarkdown stage). */
  markdownText?: string;
  /** Loaded template metadata/config for plugin decisions. */
  templateData?: TemplateData;
}

/** Minimal CLI program surface used by plugins. */
export interface CliProgram {
  option: (...args: unknown[]) => unknown;
}

/** Plugin contract. */
export interface Plugin {
  /** Unique plugin name used by plugin ordering and logs. */
  readonly name: string;

  /** Return whether this plugin is enabled for current config. */
  isEnabled: (config: Config) => boolean;

  /**
   * Markdown-it extension hook.
   * Runs before markdown rendering for each document.
   * Can be async for plugins that need async setup.
   */
  extendMarkdown?: (
    md: unknown,
    config: Config,
    context: PluginContext,
  ) => void | Promise<void>;

  /**
   * DOM-based post-processing.
   * Receives a mutable DOM adapter created by PluginManager (currently Cheerio).
   * Keep this typed as `unknown` to avoid binding core types to a specific DOM library.
   */
  processDom?: (
    dom: unknown,
    config: Config,
    context: PluginContext,
  ) => void | Promise<void>;

  /** Post-process final output HTML (after buildHtml, before write). */
  processOutputHtml?: (
    html: string,
    config: Config,
  ) => string | Promise<string>;

  /** Return CSS/JS assets to be injected into final output. */
  getAssets?: (config: Config) => PluginAssets | Promise<PluginAssets>;

  /**
   * Validate plugin-specific config and return warning/error messages.
   * Backward compatible:
   * - string[] -> treated as error-level messages
   * - ValidationIssue[] -> preserves level/code/hint metadata
   */
  validateConfig?: (
    config: Config,
  ) => Array<string | ValidationIssue>;
}
