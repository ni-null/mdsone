// ============================================================
// src/cli/args.ts — CLI 引數解析（commander）
// ============================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import type { CliArgs, Config, CliProgram } from "../core/types.js";
import { builtInPlugins } from "../plugins/index.js";

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
  npx mdsone README.md -o index.html --img-base64-embed --img-max-width 800 --img-compress 85

  # Use a specific config.toml
  npx mdsone --config ./config.toml

  # Ignore config.toml (use CLI/env/default only)
  npx mdsone --no-config

  # Overwrite protection: stop if output already exists
  npx mdsone README.md -o output.html -f false

CONFIGURATION PRIORITY:
  CLI arguments > Environment variables > config.toml > Default values

ENVIRONMENT VARIABLES:
  MARKDOWN_SOURCE_DIR    (fallback source when no inputs given)
  OUTPUT_FILE            (default: main.html)               → -o
  TEMPLATES_DIR          (default: templates)               → --templates-dir
  DEFAULT_TEMPLATE       (default: normal)                  → --template
  SITE_TITLE             (default: Documentation)           → --site-title
  THEME_MODE             (default: light)                   → --theme-mode
  MINIFY_HTML            (default: true)                    → --minify-html
  BUILD_DATE             (auto-generated if not set)
  MARKDOWN_EXTENSIONS    (comma-separated list)
  LOCALE                 (default: en)                      → --locale
  I18N_MODE              (default: false)                   → --i18n-mode
  DEFAULT_LOCALE         (default: empty)                   → --i18n-default
  IMG_TO_BASE64          (default: false)                   → --img-base64-embed
  IMG_MAX_WIDTH          (default: 0)                       → --img-max-width
  IMG_COMPRESS           (default: 0)                       → --img-compress
  CODE_HIGHLIGHT         (default: true)                    → --code-highlight
  CODE_COPY              (default: true)                    → --code-copy
  CODE_LINE_COPY         (default: false)                   → --line-copy
  CODE_LINE_NUMBER       (default: false)                   → --code-line-number
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
    // Templates & Styling
    .option("--template <NAME>", "Template name (normal, minimal; default: normal)")
    .option("--site-title <TEXT>", "Documentation site title (default: Documentation)")
    .option("--theme-mode <light|dark>", "Theme mode: light or dark (default: light)")
    .option("--minify-html <true|false>", "Minify HTML output (default: true)")
    // Internationalization
    .option("--locale <CODE>", "UI locale code (e.g., en, zh-TW; default: en)")
    .option("--i18n-mode", "Enable multi-language mode")
    .option("--i18n-default <CODE>", "Default locale in i18n mode")
    // Config
    .option("--config <PATH>", "Specify config.toml path")
    .option("--no-config", "Ignore config.toml")
    .allowUnknownOption(false);

  // Plugin-owned CLI options
  for (const plugin of builtInPlugins) {
    plugin.registerCli?.(program as unknown as CliProgram);
  }

  program.parse(argv ?? process.argv);
  const opts = program.opts<Record<string, unknown>>();
  const typed = opts as {
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
    config?: string;
    configPath?: string;
    noConfig?: boolean;
    version?: boolean;
  };

  const inputs: string[] = (program.processedArgs[0] as string[] | undefined) ?? [];
  const pluginOverrides: Partial<Config> = {};
  for (const plugin of builtInPlugins) {
    plugin.cliToConfig?.(opts, pluginOverrides);
  }

  return {
    inputs,
    merge: typed.merge,
    output: typed.output,
    force: typed.force,
    template: typed.template,
    locale: typed.locale,
    siteTitle: typed.siteTitle,
    themeMode: typed.themeMode,
    i18nMode: typed.i18nMode,
    defaultLocale: typed.defaultLocale,
    minifyHtml: typed.minifyHtml,
    templatesDir: typed.templatesDir,
    configPath: typed.config,
    noConfig: typed.noConfig,
    pluginOverrides,
    version: typed.version,
  };
}

