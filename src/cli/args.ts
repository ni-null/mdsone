// ============================================================
// src/cli/args.ts — CLI 引數解析（commander）
// ============================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, type Help, type Option } from "commander";
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

function findI18nModeSpaceArg(args: string[]): string | null {
  const localeLike = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--i18n-mode" && args[i] !== "-i") continue;
    const next = args[i + 1];
    if (!next) continue;
    if (next.startsWith("-")) continue;
    if (localeLike.test(next)) {
      return next;
    }
  }
  return null;
}

function findCodeCopySpaceArg(args: string[]): string | null {
  const modeLike = /^(off|line|cmd)$/i;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--code-copy") continue;
    const next = args[i + 1];
    if (!next) continue;
    if (next.startsWith("-")) continue;
    if (modeLike.test(next)) {
      return next;
    }
  }
  return null;
}

function findCodeHighlightSpaceArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--code-highlight") continue;
    const next = args[i + 1];
    if (!next) continue;
    if (next.startsWith("-")) continue;
    if (/^off$/i.test(next)) return next;
  }
  return null;
}

function findCodeLineNumberSpaceArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--code-line-number") continue;
    const next = args[i + 1];
    if (!next) continue;
    if (next.startsWith("-")) continue;
    if (/^off$/i.test(next)) return next;
  }
  return null;
}

function findImgEmbedSpaceArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--img-embed") continue;
    const next = args[i + 1];
    if (!next) continue;
    if (next.startsWith("-")) continue;
    if (/^(off|base64)$/i.test(next)) return next;
  }
  return null;
}

function formatGroupedHelp(
  cmd: Command,
  helper: Help,
  pluginFlags: Set<string>,
): string {
  const termWidth = helper.padWidth(cmd, helper);
  const helpWidth = helper.helpWidth || 80;
  const itemIndentWidth = 2;
  const itemSeparatorWidth = 2;
  const formatItem = (term: string, description?: string): string => {
    if (!description) return term;
    const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
    return helper.wrap(
      fullText,
      helpWidth - itemIndentWidth,
      termWidth + itemSeparatorWidth,
    );
  };
  const formatList = (textArray: string[]): string => {
    return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
  };

  let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];

  const commandDescription = helper.commandDescription(cmd);
  if (commandDescription.length > 0) {
    output = output.concat([helper.wrap(commandDescription, helpWidth, 0), ""]);
  }

  const argumentList = helper.visibleArguments(cmd).map((argument) => {
    return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
  });
  if (argumentList.length > 0) {
    output = output.concat(["Arguments:", formatList(argumentList), ""]);
  }

  const visibleOptions = helper.visibleOptions(cmd);
  const pluginOptions = visibleOptions.filter((option) => pluginFlags.has(option.flags));
  const coreOptions = visibleOptions.filter((option) => !pluginFlags.has(option.flags));

  const coreOptionList = coreOptions.map((option) => {
    return formatItem(helper.optionTerm(option), helper.optionDescription(option));
  });
  if (coreOptionList.length > 0) {
    output = output.concat(["Options:", formatList(coreOptionList), ""]);
  }

  const pluginOptionList = pluginOptions.map((option) => {
    return formatItem(helper.optionTerm(option), helper.optionDescription(option));
  });
  if (pluginOptionList.length > 0) {
    output = output.concat(["Plugins:", formatList(pluginOptionList), ""]);
  }

  return output.join("\n");
}

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
    // Output
    .option("-m, --merge", "Merge all inputs into a single HTML output")
    .option("-o, --output <PATH>", "Output HTML file path")
    .option("-f, --force", "Overwrite existing output file")
    // Templates & Styling
    .option("-t, --template <NAME|PATH[@VARIANT]>", "Template name/path with optional variant (e.g. normal@warm-cream)")
    .option("--title <TEXT>", "Documentation site title (default: Documentation)")
    // Internationalization
    .option("-i, --i18n-mode [CODE]", "Enable multi-language mode; optional CODE via --i18n-mode=CODE (e.g. --i18n-mode=zh-TW, -i=zh-TW)")
    // Config
    .option("-c, --config <PATH>", "Specify config.toml path")
    .allowUnknownOption(false);

  const coreOptionFlags = new Set(program.options.map((option) => option.flags));

  // Plugin-owned CLI options
  for (const plugin of builtInPlugins) {
    plugin.registerCli?.(program as unknown as CliProgram);
  }

  const pluginOptionFlags = new Set(
    program.options
      .filter((option: Option) => !coreOptionFlags.has(option.flags))
      .map((option: Option) => option.flags),
  );
  program.configureHelp({
    formatHelp: (cmd: Command, helper: Help): string =>
      formatGroupedHelp(cmd, helper, pluginOptionFlags),
  });

  const parseInput = argv ?? process.argv;
  const badLocale = findI18nModeSpaceArg(parseInput);
  if (badLocale) {
    program.error(
      `Invalid i18n mode syntax. Use '--i18n-mode=${badLocale}' (or '-i=${badLocale}') instead.`,
      { exitCode: 1 },
    );
  }
  const badCopyMode = findCodeCopySpaceArg(parseInput);
  if (badCopyMode) {
    program.error(
      `Invalid code copy syntax: '--code-copy ${badCopyMode}'. Use '--code-copy=${badCopyMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badHighlightMode = findCodeHighlightSpaceArg(parseInput);
  if (badHighlightMode) {
    program.error(
      `Invalid code highlight syntax: '--code-highlight ${badHighlightMode}'. Use '--code-highlight=${badHighlightMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badLineNumberMode = findCodeLineNumberSpaceArg(parseInput);
  if (badLineNumberMode) {
    program.error(
      `Invalid line number syntax: '--code-line-number ${badLineNumberMode}'. Use '--code-line-number=${badLineNumberMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badImgEmbedMode = findImgEmbedSpaceArg(parseInput);
  if (badImgEmbedMode) {
    program.error(
      `Invalid image embed syntax: '--img-embed ${badImgEmbedMode}'. Use '--img-embed=${badImgEmbedMode}' instead.`,
      { exitCode: 1 },
    );
  }

  program.parse(parseInput);
  const opts = program.opts<Record<string, unknown>>();
  const typed = opts as {
    merge?: boolean;
    output?: string;
    force?: boolean;
    template?: string;
    title?: string;
    siteTitle?: string;
    i18nMode?: boolean | string;
    config?: string;
    configPath?: string;
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
    siteTitle: typed.title ?? typed.siteTitle,
    i18nMode: typed.i18nMode,
    configPath: typed.config,
    pluginOverrides,
    version: typed.version,
  };
}

