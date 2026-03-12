// ============================================================
// src/cli/args.ts — CLI 引數解析（commander）
// 對應 Python main.py 的 argparse 段落
// ============================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type { CliArgs } from "../core/types.js";

function readPkgVersion(): string {
  try {
    const dir = import.meta.url
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();
    const candidates = [
      path.resolve(dir, "../../package.json"),  // dev: src/cli/ → root
      path.resolve(dir, "../package.json"),      // dist: dist/ → root
      path.resolve(process.cwd(), "package.json"),
    ];
    for (const p of candidates) {
      try {
        const data = JSON.parse(readFileSync(p, "utf-8")) as { version?: string; name?: string };
        if (data.name === "mdsone") return data.version ?? "0.0.0";
      } catch { /* try next */ }
    }
  } catch { /* fall through */ }
  return "0.0.0";
}

const VERSION = readPkgVersion();

const EXAMPLES = `
EXAMPLES:
  # Basic: Convert single file
  npx mdsone --source README.md --output index.html

  # Convert entire directory
  npx mdsone --source ./docs --output build/docs.html

  # With template and locale
  npx mdsone --template minimal --locale zh-TW --source ./markdown

  # Customize site title and theme
  npx mdsone --source ./docs --output docs.html --site-title "My Docs" --theme-mode dark

  # Enable multi-language mode
  npx mdsone --source ./docs --i18n-mode true --default-locale zh-TW

  # Image optimization
  npx mdsone --source README.md --output index.html --img-to-base64 true --img-max-width 800 --img-compress 85

  # Output control
  npx mdsone --source ./docs --output-dir ./dist --output-filename guide.html

CONFIGURATION PRIORITY:
  CLI arguments > Environment variables > config.toml > Default values

ENVIRONMENT VARIABLES:
  MARKDOWN_SOURCE_DIR    (default: ./markdown)              → --source
  OUTPUT_FILE            (default: system_guide.html)       → --output
  OUTPUT_DIR             (default: empty)                   → --output-dir
  OUTPUT_FILENAME        (default: empty)                   → --output-filename
  DEFAULT_TEMPLATE       (default: normal)                  → --template
  SITE_TITLE             (default: Documentation)           → --site-title
  THEME_MODE             (default: light)                   → --theme-mode
  LOCALE                 (default: en)                      → --locale
  I18N_MODE              (default: false)                   → --i18n-mode
  DEFAULT_LOCALE         (default: empty)                   → --default-locale
  MINIFY_HTML            (default: true)                    → --minify-html
  TEMPLATES_DIR          (default: templates)               → --templates-dir
  LOCALES_DIR            (default: locales)                 → --locales-dir
  TEMPLATE_CONFIG_FILE   (default: template.config.json)
  BUILD_DATE             (auto-generated if not set)
`;

/**
 * 解析 CLI 引數並回傳 CliArgs（純物件，不修改 process.env）。
 * 對應 Python argparse + CONFIG 覆寫段落。
 */
export function parseArgs(argv?: string[]): CliArgs {
  const program = new Command();

  program
    .name("mdsone")
    .description("mdsone — Convert Markdown to self-contained HTML")
    .version(VERSION, "-v, --version", "Display version")
    .addHelpText("after", EXAMPLES)
    // Paths
    .option("--source <PATH>",             "Markdown source (file or directory)")
    .option("--output <PATH>",             "Output HTML file path")
    .option("--output-dir <DIR>",          "Output directory")
    .option("--output-filename <NAME>",    "Output filename (e.g., docs.html)")
    .option("--templates-dir <DIR>",       "Templates directory (default: templates)")
    .option("--locales-dir <DIR>",         "Locales directory (default: locales)")
    // Templates & Styling
    .option("--template <NAME>",           "Template name (normal, minimal; default: normal)")
    .option("--site-title <TEXT>",         "Documentation site title (default: Documentation)")
    .option("--theme-mode <light|dark>",   "Theme mode: light or dark (default: light)")
    .option("--minify-html <true|false>",  "Minify HTML output (default: true)")
    // Internationalization
    .option("--locale <CODE>",             "UI locale code (e.g., en, zh-TW; default: en)")
    .option("--i18n-mode <true|false>",    "Enable multi-language mode (default: false)")
    .option("--default-locale <CODE>",     "Default locale in i18n mode")
    // Image Processing
    .option("--img-to-base64 <true|false>", "Embed images as base64 (default: false)")
    .option("--img-max-width <pixels>",     "Max image width in pixels (requires 'sharp' package)")
    .option("--img-compress <1-100>",       "Image compression quality 1-100 (requires 'sharp' package)")
    // Code features
    .option("--code-highlight <enable|disable>", "Syntax highlighting via highlight.js (default: enable)")
    .option("--code-copy <enable|disable>",      "Copy button on code blocks (default: enable)")
    .option("--code-highlight-theme <NAME>",       "highlight.js dark theme name (default: atom-one-dark)")
    .option("--code-highlight-theme-light <NAME>", "highlight.js light theme name (default: atom-one-light)")
    .allowUnknownOption(false);

  program.parse(argv ?? process.argv);
  const opts = program.opts<{
    template?:         string;
    locale?:           string;
    output?:           string;
    source?:           string;
    outputDir?:        string;
    outputFilename?:   string;
    siteTitle?:        string;
    themeMode?:        string;
    i18nMode?:         string;
    defaultLocale?:    string;
    minifyHtml?:       string;
    templatesDir?:     string;
    localesDir?:       string;
    imgToBase64?:      string;
    imgMaxWidth?:      string;
    imgCompress?:      string;
    codeHighlight?:          string;
    codeCopy?:               string;
    codeHighlightTheme?:     string;
    codeHighlightThemeLight?: string;
    version?:                boolean;
  }>();

  return {
    template:          opts.template,
    locale:            opts.locale,
    output:            opts.output,
    source:            opts.source,
    outputDir:         opts.outputDir,
    outputFilename:    opts.outputFilename,
    siteTitle:         opts.siteTitle,
    themeMode:         opts.themeMode,
    i18nMode:          opts.i18nMode,
    defaultLocale:     opts.defaultLocale,
    minifyHtml:        opts.minifyHtml,
    templatesDir:      opts.templatesDir,
    localesDir:        opts.localesDir,
    imgToBase64:       opts.imgToBase64,
    imgMaxWidth:       opts.imgMaxWidth,
    imgCompress:       opts.imgCompress,
    codeHighlight:          opts.codeHighlight,
    codeCopy:               opts.codeCopy,
    codeHighlightTheme:     opts.codeHighlightTheme,
    codeHighlightThemeLight: opts.codeHighlightThemeLight,
    version:                opts.version,
  };
}
