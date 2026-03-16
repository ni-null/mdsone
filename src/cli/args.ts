// ============================================================
// src/cli/args.ts — CLI 引數解析（commander）
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
  # [Batch] Single file → auto-named README.html in CWD
  npx mdsone README.md

  # [Batch] Single file with explicit output path
  npx mdsone README.md -o dist/index.html

  # [Batch] Multiple files → a.html, b.html, c.html in CWD
  npx mdsone a.md b.md c.md

  # [Batch] Multiple files into specified directory
  npx mdsone a.md b.md -o ./out

  # [Batch] Entire folder → -o (output dir) is required
  npx mdsone ./docs -o ./dist

  # [Merge] Multiple files merged → merge.html in CWD
  npx mdsone intro.md guide.md reference.md -m

  # [Merge] Multiple files merged with explicit output
  npx mdsone intro.md guide.md reference.md -m -o manual.html

  # [Merge] Folder → auto-named docs.html in CWD
  npx mdsone ./docs -m

  # [Merge] Folder with explicit output
  npx mdsone ./docs -m -o dist/manual.html

  # With template and locale
  npx mdsone ./markdown --template minimal --locale zh-TW

  # Multi-language folder (i18n mode requires single folder)
  npx mdsone ./docs --i18n-mode --i18n-default zh-TW

  # Image optimization
  npx mdsone README.md -o index.html --img-to-base64 true --img-max-width 800 --img-compress 85

  # Overwrite protection: stop if output already exists
  npx mdsone README.md -o output.html -f false

CONFIGURATION PRIORITY:
  CLI arguments > Environment variables > config.toml > Default values

ENVIRONMENT VARIABLES:
  MARKDOWN_SOURCE_DIR    (fallback source when no inputs given)
  OUTPUT_FILE            (default: main.html)               → -o
  DEFAULT_TEMPLATE       (default: normal)                  → --template
  SITE_TITLE             (default: Documentation)           → --site-title
  THEME_MODE             (default: light)                   → --theme-mode
  LOCALE                 (default: en)                      → --locale
  I18N_MODE              (default: false)                   → --i18n-mode
  DEFAULT_LOCALE         (default: empty)                   → --i18n-default
  MINIFY_HTML            (default: true)                    → --minify-html
  TEMPLATES_DIR          (default: templates)               → --templates-dir
  LOCALES_DIR            (default: locales)                 → --locales-dir
  BUILD_DATE             (auto-generated if not set)
`;

/**
 * 解析 CLI 引數並回傳 CliArgs（純物件，不修改 process.env）。
 */
export function parseArgs(argv?: string[]): CliArgs {
  const program = new Command();

  program
    .name("mdsone")
    .description("mdsone — Convert Markdown to self-contained HTML")
    .version(VERSION, "-v, --version", "Display version")
    .argument("[inputs...]", "Input: single file, multiple files, or single folder path")
    .addHelpText("after", EXAMPLES)
    // Output
    .option("-m, --merge", "Merge all inputs into a single HTML output")
    .option("-o, --output <PATH>", "Output HTML file path")
    .option("-f, --force <boolean>", "Overwrite existing output file (default: true)", "true")
    // Paths
    .option("--templates-dir <DIR>", "Templates directory (default: templates)")
    .option("--locales-dir <DIR>", "Locales directory (default: locales)")
    // Templates & Styling
    .option("--template <NAME>", "Template name (normal, minimal; default: normal)")
    .option("--site-title <TEXT>", "Documentation site title (default: Documentation)")
    .option("--theme-mode <light|dark>", "Theme mode: light or dark (default: light)")
    .option("--minify-html <true|false>", "Minify HTML output (default: true)")
    // Internationalization
    .option("--locale <CODE>", "UI locale code (e.g., en, zh-TW; default: en)")
    .option("--i18n-mode", "Enable multi-language mode")
    .option("--i18n-default <CODE>", "Default locale in i18n mode")
    // Image Processing
    .option("--img-to-base64 <true|false>", "Embed images as base64 (default: false)")
    .option("--img-max-width <pixels>", "Max image width in pixels (requires 'sharp' package)")
    .option("--img-compress <1-100>", "Image compression quality 1-100 (requires 'sharp' package)")
    // Code features
    .option("--code-highlight <enable|disable>", "Syntax highlighting via highlight.js (default: enable)")
    .option("--code-copy <enable|disable>", "Copy button on code blocks (default: enable)")
    .option("--code-highlight-theme <NAME>", "highlight.js dark theme name (default: atom-one-dark)")
    .option("--code-highlight-theme-light <NAME>", "highlight.js light theme name (default: atom-one-light)")
    .allowUnknownOption(false);

  program.parse(argv ?? process.argv);
  const opts = program.opts<{
    merge?: boolean;
    output?: string;
    force?: string;
    template?: string;
    locale?: string;
    siteTitle?: string;
    themeMode?: string;
    i18nMode?: boolean;
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
  }>();

  const inputs: string[] = (program.processedArgs[0] as string[] | undefined) ?? [];

  return {
    inputs,
    merge: opts.merge,
    output: opts.output,
    force: opts.force,
    template: opts.template,
    locale: opts.locale,
    siteTitle: opts.siteTitle,
    themeMode: opts.themeMode,
    i18nMode: opts.i18nMode,
    defaultLocale: opts.defaultLocale,
    minifyHtml: opts.minifyHtml,
    templatesDir: opts.templatesDir,
    localesDir: opts.localesDir,
    imgToBase64: opts.imgToBase64,
    imgMaxWidth: opts.imgMaxWidth,
    imgCompress: opts.imgCompress,
    codeHighlight: opts.codeHighlight,
    codeCopy: opts.codeCopy,
    codeHighlightTheme: opts.codeHighlightTheme,
    codeHighlightThemeLight: opts.codeHighlightThemeLight,
    version: opts.version,
  };
}
