// ============================================================
// src/cli/args.ts — CLI 引數解析（commander）
// ============================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command, type Help, type Option } from "commander";
import type { CliArgs, Config, CliProgram } from "../core/types.js";
import { applyPluginCliToConfig, registerPluginCliOptions } from "../plugins/option-specs.js";

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
const ON_OFF_PATTERN = /^(on|off)$/i;

function findInvalidSpaceArg(
  args: string[],
  flags: string[],
  validator: (value: string) => boolean,
): string | null {
  for (let i = 0; i < args.length; i++) {
    if (!flags.includes(args[i])) continue;
    const next = args[i + 1];
    if (!next) continue;
    if (next.startsWith("-")) continue;
    if (validator(next)) return next;
  }
  return null;
}

function normalizeBareMarkdownModeFlag(args: string[], flag: string): string[] {
  return args.map((arg) => (arg === flag ? `${flag}=on` : arg));
}

function parseOnOffMode(raw: unknown, flagName: string): boolean {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error(`Invalid value for --${flagName}. Use on/off.`);
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
    .description("mdsone — Convert Markdown to self-contained HTML (MCP: use `mdsone mcp`)")
    .version(VERSION, "-v, --version", "Display version")
    .argument("[inputs...]", "Input: single file, multiple files, or single folder path")
    .option("--template-dev", "Start template development server (source checkout only)")
    // Output
    .option("-m, --merge", "Merge all inputs into a single HTML output")
    .option("-o, --output <PATH>", "Output HTML file path")
    .option("-f, --force", "Overwrite existing output file")
    // Templates & Styling
    .option("-t, --template <NAME|PATH[@VARIANT]>", "Template name/path with optional variant (e.g. normal@warm-cream)")
    .option("--title <TEXT>", "Documentation site title (default: Documentation)")
    // Internationalization
    .option("-i, --i18n-mode [CODE]", "Enable multi-language mode; optional CODE via --i18n-mode=CODE (e.g. --i18n-mode=zh-TW, -i=zh-TW)")
    // Markdown-it options
    .option(
      "--md-linkify <on|off>",
      "Markdown-it linkify (use --md-linkify as shorthand for --md-linkify=on)",
      (value: string) => parseOnOffMode(value, "md-linkify"),
    )
    .option(
      "--md-typographer <on|off>",
      "Markdown-it typographer (use --md-typographer as shorthand for --md-typographer=on)",
      (value: string) => parseOnOffMode(value, "md-typographer"),
    )
    .option(
      "--md-breaks <on|off>",
      "Markdown-it breaks (use --md-breaks as shorthand for --md-breaks=on)",
      (value: string) => parseOnOffMode(value, "md-breaks"),
    )
    .option(
      "--md-xhtml-out <on|off>",
      "Markdown-it xhtmlOut (use --md-xhtml-out as shorthand for --md-xhtml-out=on)",
      (value: string) => parseOnOffMode(value, "md-xhtml-out"),
    )
    // Config
    .option("-c, --config <PATH>", "Specify config.toml path")
    .allowUnknownOption(false);

  const coreOptionFlags = new Set(program.options.map((option) => option.flags));

  // Plugin-owned CLI options
  registerPluginCliOptions(program as unknown as CliProgram);

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
  const badLocale = findInvalidSpaceArg(
    parseInput,
    ["--i18n-mode", "-i"],
    (value) => /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/.test(value),
  );
  if (badLocale) {
    program.error(
      `Invalid i18n mode syntax. Use '--i18n-mode=${badLocale}' (or '-i=${badLocale}') instead.`,
      { exitCode: 1 },
    );
  }
  const badCopyMode = findInvalidSpaceArg(
    parseInput,
    ["--code-copy"],
    (value) => /^(off|line|cmd)$/i.test(value),
  );
  if (badCopyMode) {
    program.error(
      `Invalid code copy syntax: '--code-copy ${badCopyMode}'. Use '--code-copy=${badCopyMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badHighlightMode = findInvalidSpaceArg(
    parseInput,
    ["--code-highlight"],
    (value) => /^off$/i.test(value),
  );
  if (badHighlightMode) {
    program.error(
      `Invalid code highlight syntax: '--code-highlight ${badHighlightMode}'. Use '--code-highlight=${badHighlightMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badLineNumberMode = findInvalidSpaceArg(
    parseInput,
    ["--code-line-number"],
    (value) => /^off$/i.test(value),
  );
  if (badLineNumberMode) {
    program.error(
      `Invalid line number syntax: '--code-line-number ${badLineNumberMode}'. Use '--code-line-number=${badLineNumberMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badImgEmbedMode = findInvalidSpaceArg(
    parseInput,
    ["--img-embed"],
    (value) => /^(off|base64)$/i.test(value),
  );
  if (badImgEmbedMode) {
    program.error(
      `Invalid image embed syntax: '--img-embed ${badImgEmbedMode}'. Use '--img-embed=${badImgEmbedMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badMdLinkifyMode = findInvalidSpaceArg(
    parseInput,
    ["--md-linkify"],
    (value) => ON_OFF_PATTERN.test(value),
  );
  if (badMdLinkifyMode) {
    program.error(
      `Invalid markdown syntax: '--md-linkify ${badMdLinkifyMode}'. Use '--md-linkify=${badMdLinkifyMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badMdTypographerMode = findInvalidSpaceArg(
    parseInput,
    ["--md-typographer"],
    (value) => ON_OFF_PATTERN.test(value),
  );
  if (badMdTypographerMode) {
    program.error(
      `Invalid markdown syntax: '--md-typographer ${badMdTypographerMode}'. Use '--md-typographer=${badMdTypographerMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badMdBreaksMode = findInvalidSpaceArg(
    parseInput,
    ["--md-breaks"],
    (value) => ON_OFF_PATTERN.test(value),
  );
  if (badMdBreaksMode) {
    program.error(
      `Invalid markdown syntax: '--md-breaks ${badMdBreaksMode}'. Use '--md-breaks=${badMdBreaksMode}' instead.`,
      { exitCode: 1 },
    );
  }
  const badMdXhtmlOutMode = findInvalidSpaceArg(
    parseInput,
    ["--md-xhtml-out"],
    (value) => ON_OFF_PATTERN.test(value),
  );
  if (badMdXhtmlOutMode) {
    program.error(
      `Invalid markdown syntax: '--md-xhtml-out ${badMdXhtmlOutMode}'. Use '--md-xhtml-out=${badMdXhtmlOutMode}' instead.`,
      { exitCode: 1 },
    );
  }

  const normalizedParseInput = [
    ...normalizeBareMarkdownModeFlag(
      normalizeBareMarkdownModeFlag(
        normalizeBareMarkdownModeFlag(
          normalizeBareMarkdownModeFlag(parseInput, "--md-linkify"),
          "--md-typographer",
        ),
        "--md-breaks",
      ),
      "--md-xhtml-out",
    ),
  ];

  program.parse(normalizedParseInput);
  const opts = program.opts<Record<string, unknown>>();
  const typed = opts as {
    templateDev?: boolean;
    merge?: boolean;
    output?: string;
    force?: boolean;
    template?: string;
    title?: string;
    siteTitle?: string;
    i18nMode?: boolean | string;
    mdLinkify?: boolean;
    mdTypographer?: boolean;
    mdBreaks?: boolean;
    mdXhtmlOut?: boolean;
    config?: string;
    configPath?: string;
    version?: boolean;
  };

  const inputs: string[] = (program.processedArgs[0] as string[] | undefined) ?? [];
  const pluginOverrides: Partial<Config> = {};
  applyPluginCliToConfig(opts, pluginOverrides);
  const markdown = {
    linkify: typed.mdLinkify,
    typographer: typed.mdTypographer,
    breaks: typed.mdBreaks,
    xhtml_out: typed.mdXhtmlOut,
  };
  const hasMarkdownOverrides = (
    markdown.linkify !== undefined ||
    markdown.typographer !== undefined ||
    markdown.breaks !== undefined ||
    markdown.xhtml_out !== undefined
  );

  return {
    inputs,
    templateDev: typed.templateDev,
    merge: typed.merge,
    output: typed.output,
    force: typed.force,
    template: typed.template,
    siteTitle: typed.title ?? typed.siteTitle,
    i18nMode: typed.i18nMode,
    markdown: hasMarkdownOverrides ? markdown : undefined,
    configPath: typed.config,
    pluginOverrides,
    version: typed.version,
  };
}
