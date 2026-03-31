// ============================================================
// src/cli/pipeline.ts
// CLI pipeline orchestration and mode handlers.
// ============================================================

import path from "node:path";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import { CliError } from "./errors.js";
import { runTemplateDevLauncher } from "./template-dev-launcher.js";
import { cliArgsToConfig } from "../core/config.js";
import { resolveBuildDate } from "../core/build-date.js";
import { markdownToHtmlAsync } from "../core/markdown.js";
import { getAllTemplateStrings, getAllLocalesTemplateStrings } from "../core/i18n.js";
import { buildHtml } from "../core/builder.js";
import { collectConfigValidationIssues } from "../core/validator.js";
import type { CliArgs, Config, TemplateData, ValidationIssue } from "../core/types.js";
import {
  loadConfigFile,
  buildConfig,
} from "../adapters/node/config_loader.js";
import {
  scanMarkdownFiles,
  scanLocaleSubDirs,
  scanTemplates,
  loadTemplateFiles,
  loadLocaleFile,
  loadLocaleNamesConfig,
  loadTemplateLocaleFile,
  readTextFile,
  writeTextFile,
  ensureDir,
  fileExists,
  dirExists,
  isMdFile,
} from "../adapters/node/fs.js";
import { PluginManager, type PluginProgressHook } from "../plugins/manager.js";

export interface CliPipelineLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  outputLine: (outputPath: string, sizeBytes: number | null) => void;
  progressStart?: (message: string) => void;
  progressUpdate?: (message: string) => void;
  progressSucceed?: (message: string) => void;
  progressFail?: (message: string) => void;
  progressStop?: () => void;
}

type ResolvedInputs = {
  inputFiles: string[];
  inputDirs: string[];
  isSingleFile: boolean;
  isMultiFile: boolean;
  isFolder: boolean;
  mergeMode: boolean;
};

type OutputPlan = {
  force: boolean;
  outputFile: string;
  outputDir: string;
};

type TemplateContext = {
  templateRootDir: string;
  templateName: string;
  templateData: TemplateData;
};

type RuntimeContext = {
  config: Config;
  templateRootDir: string;
  templateName: string;
  templateData: TemplateData;
  pluginManager: PluginManager;
  localeNames: Record<string, string>;
  libCss: string;
  libJs: string;
};

type LocaleFile = Awaited<ReturnType<typeof loadLocaleFile>>;

type DocumentRenderProgress = {
  logger: CliPipelineLogger;
  prefix: string;
  sourceLabel: string;
};

type OutputBuildProgress = {
  logger: CliPipelineLogger;
  prefix: string;
  stepLabel: string;
};

function fail(message: string, details?: string[]): never {
  throw new CliError(message, { details });
}

function progressStart(logger: CliPipelineLogger, message: string): void {
  logger.progressStart?.(message);
}

function progressUpdate(logger: CliPipelineLogger, message: string): void {
  logger.progressUpdate?.(message);
}

function progressStop(logger: CliPipelineLogger): void {
  logger.progressStop?.();
}

function fileStepPrefix(current: number, total: number): string {
  return total > 1 ? `(${current}/${total}) ` : "";
}

function formatIssue(issue: ValidationIssue): string {
  const scope = issue.plugin ? `[${issue.plugin}] ` : "";
  const code = issue.code ? ` (${issue.code})` : "";
  const hint = issue.hint ? ` Hint: ${issue.hint}` : "";
  return `${scope}${issue.message}${code}${hint}`;
}

function runPreflightValidation(
  config: Config,
  pluginManager: PluginManager,
  logger: CliPipelineLogger,
): void {
  const issues = [
    ...collectConfigValidationIssues(config),
    ...pluginManager.validateConfig(config),
  ];

  for (const issue of issues.filter((x) => x.level === "warn")) {
    logger.warn(formatIssue(issue));
  }

  const errors = issues.filter((x) => x.level === "error").map(formatIssue);
  if (errors.length > 0) {
    fail(errors[0], errors.slice(1));
  }
}

async function getFileSizeBytes(filePath: string): Promise<number | null> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return null;
  }
}

/**
 * Resolve package root so built-in templates/locales work with npx/global execution.
 */
function resolvePackageRoot(): string {
  if (import.meta.url) {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const dir = path.dirname(thisFile);
      if (dir.endsWith(path.join("src", "cli"))) {
        return path.resolve(dir, "..", "..");
      }
      if (dir.endsWith("dist")) {
        return path.resolve(dir, "..");
      }
    } catch {
      // fallback to cwd below
    }
  }
  return process.cwd();
}

function isTemplateFolder(templateDir: string): boolean {
  return (
    dirExists(templateDir) &&
    fileExists(path.join(templateDir, "assets", "style.css")) &&
    fileExists(path.join(templateDir, "template.html"))
  );
}

function parseTemplateSpec(raw: string): { template: string; variant: string } {
  const input = raw.trim();
  const idx = input.lastIndexOf("@");
  if (idx === -1) {
    return { template: input, variant: "default" };
  }
  const template = input.slice(0, idx).trim();
  const variant = input.slice(idx + 1).trim();
  if (!template) {
    fail("Invalid --template value: missing template before '@'.");
  }
  if (!variant) {
    fail("Invalid --template value: missing variant after '@'.");
  }
  return { template, variant };
}

function normalizeConfigPaths(config: Config, packageRoot: string): void {
  if (!path.isAbsolute(config.locales_dir)) {
    config.locales_dir = path.resolve(packageRoot, config.locales_dir);
  }
}

function resolveBuiltInTemplatesDir(packageRoot: string): string {
  const envTemplatesDir = process.env.MDSONE_TEMPLATE_ROOT;
  if (envTemplatesDir && envTemplatesDir.trim()) {
    return path.resolve(envTemplatesDir);
  }
  return path.resolve(packageRoot, "templates");
}

function resolveInputs(args: CliArgs, config: Config): string[] {
  const fromCli = (args.inputs ?? []).map((p) => path.resolve(process.cwd(), p));
  if (fromCli.length > 0) return fromCli;
  if (config.markdown_source_dir) {
    return [path.resolve(process.cwd(), config.markdown_source_dir)];
  }
  return [];
}

function classifyInputs(args: CliArgs, inputs: string[], config: Config): ResolvedInputs {
  if (inputs.length === 0) {
    fail("No input specified. Usage: mdsone <inputs...> [-o output_path] [-f]");
  }

  for (const input of inputs) {
    if (!fileExists(input) && !dirExists(input)) {
      fail(`Cannot find input file/directory: ${input}`);
    }
  }

  const inputFiles = inputs.filter((p) => fileExists(p));
  const inputDirs = inputs.filter((p) => dirExists(p));

  if (inputFiles.length > 0 && inputDirs.length > 0) {
    fail("Mixed input (files and directories) is not supported. Please provide either a list of files OR a single directory.");
  }
  if (inputDirs.length > 1) {
    fail("Only a single directory is supported as input.");
  }

  if (inputFiles.length > 0) {
    const invalidFiles = inputFiles.filter((f) => !isMdFile(f));
    if (invalidFiles.length > 0) {
      const msg = invalidFiles.length === inputFiles.length && inputFiles.length === 1
        ? `Expected .md or .markdown file, got '${path.extname(invalidFiles[0]) || "(no extension)"}'`
        : `Not all files are markdown: ${invalidFiles.map((p) => path.basename(p)).join(", ")}`;
      fail(`Invalid input file(s). ${msg}`);
    }
  }

  const isSingleFile = inputFiles.length === 1 && isMdFile(inputFiles[0]);
  const isMultiFile = inputFiles.length > 1;
  const isFolder = inputDirs.length === 1;
  const mergeMode = !!args.merge || config.i18n_mode;

  if (config.i18n_mode && !isFolder) {
    fail("i18n mode only supports a single folder as input.");
  }

  if (!mergeMode && isFolder && !args.output) {
    fail("Batch folder mode requires an output directory. Use '-o <dir>' to specify where HTML files should be written.");
  }

  return {
    inputFiles,
    inputDirs,
    isSingleFile,
    isMultiFile,
    isFolder,
    mergeMode,
  };
}

function resolveOutputPlan(args: CliArgs, config: Config, inputs: ResolvedInputs): OutputPlan {
  const force = args.force === true;
  let outputFile = "";
  let outputDir = "";

  if (inputs.mergeMode) {
    if (args.output) {
      outputFile = path.resolve(process.cwd(), args.output);
      if (dirExists(outputFile)) {
        fail(`In merge mode, '-o' must be a file path, not a directory: '${args.output}'`);
      }
    } else if (inputs.isFolder) {
      const dirName = path.basename(inputs.inputDirs[0]);
      const baseName = (dirName && dirName !== ".") ? dirName : "merge";
      outputFile = path.join(process.cwd(), `${baseName}.html`);
    } else {
      outputFile = path.join(process.cwd(), "merge.html");
    }

    if (!force && fileExists(outputFile)) {
      fail("Output file already exists. Use '--force' to overwrite.");
    }
    config.output_file = outputFile;
    return { force, outputFile, outputDir };
  }

  if (inputs.isSingleFile) {
    if (args.output) {
      outputFile = path.resolve(process.cwd(), args.output);
      if (dirExists(outputFile)) {
        fail(`Output path '${outputFile}' is an existing directory. Please specify a file path.`);
      }
    } else {
      const base = path.basename(inputs.inputFiles[0], path.extname(inputs.inputFiles[0])) + ".html";
      outputFile = path.join(process.cwd(), base);
    }
    if (!force && fileExists(outputFile)) {
      fail("Output file already exists. Use '--force' to overwrite.");
    }
    config.output_file = outputFile;
    return { force, outputFile, outputDir };
  }

  if (args.output) {
    outputDir = path.resolve(process.cwd(), args.output);
    if (path.extname(outputDir) !== "") {
      fail(`In batch mode, '-o' must be a directory path, not a file path: '${args.output}'`);
    }
    if (fileExists(outputDir)) {
      fail(`Output path '${args.output}' is an existing file. Please specify a directory path.`);
    }
  } else {
    outputDir = process.cwd();
  }

  config.output_file = outputDir;
  return { force, outputFile, outputDir };
}

async function resolveTemplateContext(
  config: Config,
  logger: CliPipelineLogger,
  packageRoot: string,
): Promise<TemplateContext> {
  let templateRootDir = resolveBuiltInTemplatesDir(packageRoot);
  const rawTemplateSpec = (config.template || "").trim();
  const parsedTemplate = parseTemplateSpec(rawTemplateSpec);
  const rawTemplate = parsedTemplate.template;
  config.template = rawTemplate;
  config.template_variant = parsedTemplate.variant;

  let templateName = rawTemplate;
  const templateLooksLikePath = path.isAbsolute(rawTemplate) || rawTemplate.includes("/") || rawTemplate.includes("\\");
  if (templateLooksLikePath) {
    const templateDir = path.isAbsolute(rawTemplate)
      ? rawTemplate
      : path.resolve(process.cwd(), rawTemplate);
    if (!isTemplateFolder(templateDir)) {
      fail(
        `Template folder is invalid: ${templateDir}`,
        ["Expected files: template.html + assets/style.css"],
      );
    }
    templateRootDir = path.dirname(templateDir);
    templateName = path.basename(templateDir);
  }

  const availableTemplates = await scanTemplates(templateRootDir);
  if (availableTemplates.length === 0) {
    fail(`No templates found in: ${templateRootDir}`);
  }
  if (!availableTemplates.includes(templateName)) {
    fail(`Template not found: ${templateName}`, [`Available: ${availableTemplates.join(", ")}`]);
  }

  let templateData: TemplateData;
  try {
    templateData = await loadTemplateFiles(templateRootDir, templateName);
  } catch (e) {
    fail(`Failed to load template: ${e instanceof Error ? e.message : String(e)}`);
  }

  const variantName = config.template_variant || "default";
  if (templateData.config.types && !templateData.config.types[variantName]) {
    logger.warn(`template variant '${variantName}' not found. Falling back to 'default'.`);
    config.template_variant = "default";
  }

  return {
    templateRootDir,
    templateName,
    templateData,
  };
}

async function writeOutput(outputFile: string, content: string): Promise<void> {
  try {
    const dir = path.dirname(outputFile);
    if (dir && dir !== ".") await ensureDir(dir);
    await writeTextFile(outputFile, content);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("EACCES") || msg.includes("EPERM")) {
      fail(`Permission denied: Cannot write to ${outputFile}`);
    }
    fail(`Failed to write output: ${msg}`);
  }
}

async function loadMergedLocale(
  config: Config,
  templateRootDir: string,
  templateName: string,
  locale: string,
): Promise<LocaleFile> {
  const globalLocale = await loadLocaleFile(config.locales_dir, locale);
  const tplLocale = await loadTemplateLocaleFile(templateRootDir, templateName, locale);
  if (!tplLocale?.template) return globalLocale;
  return {
    ...globalLocale,
    template: { ...(globalLocale.template ?? {}), ...tplLocale.template },
  };
}

async function buildAndWriteSingleOutput(params: {
  config: Config;
  templateData: TemplateData;
  pluginManager: PluginManager;
  outputFile: string;
  documents?: Record<string, string>;
  multiDocuments?: Record<string, Record<string, string>>;
  i18nStrings?: Record<string, string>;
  multiI18nStrings?: Record<string, Record<string, string>>;
  localeNames: Record<string, string>;
  libCss: string;
  libJs: string;
  progress?: OutputBuildProgress;
}): Promise<void> {
  if (params.progress) {
    progressUpdate(
      params.progress.logger,
      `${params.progress.prefix}${params.progress.stepLabel} - build html`,
    );
  }
  const htmlRaw = buildHtml({
    config: params.config,
    templateData: params.templateData,
    documents: params.documents,
    multiDocuments: params.multiDocuments,
    i18nStrings: params.i18nStrings,
    multiI18nStrings: params.multiI18nStrings,
    localeNames: params.localeNames,
    libCss: params.libCss,
    libJs: params.libJs,
  });
  const buildProgress = params.progress;
  const outputHook: PluginProgressHook | undefined = buildProgress
    ? (_phase, pluginName) => {
      progressUpdate(
        buildProgress.logger,
        `${buildProgress.prefix}${buildProgress.stepLabel} - plugin(output): ${pluginName}`,
      );
    }
    : undefined;
  const finalHtml = await params.pluginManager.processOutputHtml(htmlRaw, params.config, outputHook);
  if (params.progress) {
    progressUpdate(
      params.progress.logger,
      `${params.progress.prefix}${params.progress.stepLabel} - write file`,
    );
  }
  await writeOutput(params.outputFile, finalHtml);
}

function createRuntimeContext(
  config: Config,
  templateContext: TemplateContext,
  pluginManager: PluginManager,
  localeNames: Record<string, string>,
  libCss: string,
  libJs: string,
): RuntimeContext {
  return {
    config,
    templateRootDir: templateContext.templateRootDir,
    templateName: templateContext.templateName,
    templateData: templateContext.templateData,
    pluginManager,
    localeNames,
    libCss,
    libJs,
  };
}

async function renderMarkdownDocument(
  runtime: RuntimeContext,
  markdownText: string,
  fileIndex: number,
  sourceDir: string,
  progress?: DocumentRenderProgress,
): Promise<string> {
  if (progress) {
    progressUpdate(
      progress.logger,
      `${progress.prefix}${progress.sourceLabel} - markdown parse`,
    );
  }
  const extendHook: PluginProgressHook | undefined = progress
    ? (_phase, pluginName) => {
      progressUpdate(
        progress.logger,
        `${progress.prefix}${progress.sourceLabel} - plugin(extend): ${pluginName}`,
      );
    }
    : undefined;
  const html = await markdownToHtmlAsync(
    markdownText,
    fileIndex,
    async (md) => await runtime.pluginManager.extendMarkdown(md, runtime.config, {
      sourceDir,
      markdownText,
      templateData: runtime.templateData,
    }, extendHook),
    runtime.config.markdown,
  );
  const domHook: PluginProgressHook | undefined = progress
    ? (_phase, pluginName) => {
      progressUpdate(
        progress.logger,
        `${progress.prefix}${progress.sourceLabel} - plugin(dom): ${pluginName}`,
      );
    }
    : undefined;
  return await runtime.pluginManager.processHtml(
    html,
    runtime.config,
    { sourceDir, templateData: runtime.templateData },
    domHook,
  );
}

async function runSingleFileMode(
  runtime: RuntimeContext,
  inputFile: string,
  outputFile: string,
  logger: CliPipelineLogger,
): Promise<void> {
  progressUpdate(logger, `Read input: ${path.basename(inputFile)}`);
  const fileContent = await readTextFile(inputFile);
  if (!fileContent.trim()) {
    fail("Markdown file is empty.");
  }

  const html = await renderMarkdownDocument(
    runtime,
    fileContent,
    0,
    path.dirname(inputFile),
    {
      logger,
      prefix: "",
      sourceLabel: path.basename(inputFile),
    },
  );
  const documents: Record<string, string> = { index: html };
  progressUpdate(logger, "Load locale/template strings");
  const localeFile = await loadMergedLocale(
    runtime.config,
    runtime.templateRootDir,
    runtime.templateName,
    runtime.config.default_locale || "en",
  );
  const buildDate = resolveBuildDate(runtime.config);
  const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

  await buildAndWriteSingleOutput({
    config: runtime.config,
    templateData: runtime.templateData,
    pluginManager: runtime.pluginManager,
    outputFile,
    documents,
    i18nStrings,
    localeNames: runtime.localeNames,
    libCss: runtime.libCss,
    libJs: runtime.libJs,
    progress: {
      logger,
      prefix: "",
      stepLabel: "Finalize single output",
    },
  });
}

async function runMergeMode(
  runtime: RuntimeContext,
  inputs: ResolvedInputs,
  outputFile: string,
  logger: CliPipelineLogger,
): Promise<void> {
  if (inputs.isMultiFile) {
    const documents: Record<string, string> = {};
    const totalFiles = inputs.inputFiles.length;
    for (const [i, filepath] of inputs.inputFiles.entries()) {
      const prefix = fileStepPrefix(i + 1, totalFiles);
      const sourceLabel = path.basename(filepath);
      const tabName = path.basename(filepath, path.extname(filepath));
      try {
        progressUpdate(logger, `${prefix}${sourceLabel} - read`);
        const content = await readTextFile(filepath);
        if (content.trim()) {
          documents[tabName] = await renderMarkdownDocument(runtime, content, i, path.dirname(filepath), {
            logger,
            prefix,
            sourceLabel,
          });
        }
      } catch (e) {
        logger.warn(`Failed to read ${filepath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (Object.keys(documents).length === 0) {
      fail("No content generated.");
    }
    const localeFile = await loadMergedLocale(
      runtime.config,
      runtime.templateRootDir,
      runtime.templateName,
      runtime.config.default_locale || "en",
    );
    const buildDate = resolveBuildDate(runtime.config);
    const i18nStrings = getAllTemplateStrings(localeFile, buildDate);
    progressUpdate(logger, "Merge step - finalize merged output");
    await buildAndWriteSingleOutput({
      config: runtime.config,
      templateData: runtime.templateData,
      pluginManager: runtime.pluginManager,
      outputFile,
      documents,
      i18nStrings,
      localeNames: runtime.localeNames,
      libCss: runtime.libCss,
      libJs: runtime.libJs,
      progress: {
        logger,
        prefix: "",
        stepLabel: "Merge step",
      },
    });
    return;
  }

  if (runtime.config.i18n_mode) {
    const folderPath = inputs.inputDirs[0];
    const localeDirs = await scanLocaleSubDirs(folderPath);
    if (Object.keys(localeDirs).length === 0) {
      fail(`No [locale] subdirectories found in: ${folderPath}`);
    }

    const localeEntries: Array<{
      locale: string;
      dir: string;
      mdFiles: Awaited<ReturnType<typeof scanMarkdownFiles>>;
    }> = [];
    let totalFiles = 0;
    for (const [locale, dir] of Object.entries(localeDirs)) {
      const mdFiles = await scanMarkdownFiles(dir);
      totalFiles += mdFiles.length;
      localeEntries.push({ locale, dir, mdFiles });
    }

    const multiDocuments: Record<string, Record<string, string>> = {};
    let processed = 0;
    for (const { locale, dir, mdFiles } of localeEntries) {
      const localeDocs: Record<string, string> = {};
      for (const [idx, { filename, filepath }] of mdFiles.entries()) {
        processed += 1;
        const prefix = fileStepPrefix(processed, totalFiles);
        const sourceLabel = `${locale}/${filename}`;
        const tabName = filename.replace(/\.(md|markdown)$/i, "");
        try {
          progressUpdate(logger, `${prefix}${sourceLabel} - read`);
          const content = await readTextFile(filepath);
          if (content.trim()) {
            localeDocs[tabName] = await renderMarkdownDocument(runtime, content, idx, dir, {
              logger,
              prefix,
              sourceLabel,
            });
          }
        } catch (e) {
          logger.warn(`Failed to read ${filepath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (Object.keys(localeDocs).length > 0) {
        multiDocuments[locale] = localeDocs;
      }
    }

    if (Object.keys(multiDocuments).length === 0) {
      fail("No content generated in i18n mode.");
    }

    const localeFileMap: Record<string, LocaleFile> = {};
    for (const locale of Object.keys(multiDocuments)) {
      localeFileMap[locale] = await loadMergedLocale(
        runtime.config,
        runtime.templateRootDir,
        runtime.templateName,
        locale,
      );
    }
    const buildDate = resolveBuildDate(runtime.config);
    const multiI18nStrings = getAllLocalesTemplateStrings(localeFileMap, buildDate);
    progressUpdate(logger, "Merge step - finalize i18n merged output");
    await buildAndWriteSingleOutput({
      config: runtime.config,
      templateData: runtime.templateData,
      pluginManager: runtime.pluginManager,
      outputFile,
      multiDocuments,
      multiI18nStrings,
      localeNames: runtime.localeNames,
      libCss: runtime.libCss,
      libJs: runtime.libJs,
      progress: {
        logger,
        prefix: "",
        stepLabel: "Merge step",
      },
    });
    return;
  }

  const folderPath = inputs.inputDirs[0];
  const mdFiles = await scanMarkdownFiles(folderPath);
  if (mdFiles.length === 0) {
    fail(`No .md files found in: ${folderPath}`);
  }

  const documents: Record<string, string> = {};
  const totalFiles = mdFiles.length;
  for (const [idx, { filename, filepath }] of mdFiles.entries()) {
    const prefix = fileStepPrefix(idx + 1, totalFiles);
    const sourceLabel = filename;
    const tabName = filename.replace(/\.(md|markdown)$/i, "");
    try {
      progressUpdate(logger, `${prefix}${sourceLabel} - read`);
      const content = await readTextFile(filepath);
      if (content.trim()) {
        documents[tabName] = await renderMarkdownDocument(runtime, content, idx, folderPath, {
          logger,
          prefix,
          sourceLabel,
        });
      }
    } catch (e) {
      logger.warn(`Failed to read ${filepath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (Object.keys(documents).length === 0) {
    fail("No content generated.");
  }

  const localeFile = await loadMergedLocale(
    runtime.config,
    runtime.templateRootDir,
    runtime.templateName,
    runtime.config.default_locale || "en",
  );
  const buildDate = resolveBuildDate(runtime.config);
  const i18nStrings = getAllTemplateStrings(localeFile, buildDate);
  progressUpdate(logger, "Merge step - finalize merged output");
  await buildAndWriteSingleOutput({
    config: runtime.config,
    templateData: runtime.templateData,
    pluginManager: runtime.pluginManager,
    outputFile,
    documents,
    i18nStrings,
    localeNames: runtime.localeNames,
    libCss: runtime.libCss,
    libJs: runtime.libJs,
    progress: {
      logger,
      prefix: "",
      stepLabel: "Merge step",
    },
  });
}

async function runBatchMode(
  runtime: RuntimeContext,
  inputs: ResolvedInputs,
  outputPlan: OutputPlan,
  logger: CliPipelineLogger,
): Promise<void> {
  type BatchEntry = { filepath: string; baseName: string; baseDir: string };
  const batchFiles: BatchEntry[] = [];

  if (inputs.isMultiFile) {
    for (const f of inputs.inputFiles) {
      batchFiles.push({
        filepath: f,
        baseName: path.basename(f, path.extname(f)),
        baseDir: path.dirname(f),
      });
    }
  } else {
    const mdFiles = await scanMarkdownFiles(inputs.inputDirs[0]);
    for (const { filename, filepath } of mdFiles) {
      batchFiles.push({
        filepath,
        baseName: filename.replace(/\.(md|markdown)$/i, ""),
        baseDir: inputs.inputDirs[0],
      });
    }
  }

  if (batchFiles.length === 0) {
    fail("No .md files found.");
  }

  await ensureDir(outputPlan.outputDir);
  const localeFile = await loadMergedLocale(
    runtime.config,
    runtime.templateRootDir,
    runtime.templateName,
    runtime.config.default_locale || "en",
  );
  const buildDate = resolveBuildDate(runtime.config);
  const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

  let successCount = 0;
  const totalFiles = batchFiles.length;
  for (const [idx, { filepath, baseName, baseDir }] of batchFiles.entries()) {
    const prefix = fileStepPrefix(idx + 1, totalFiles);
    const sourceLabel = path.basename(filepath);
    const targetFile = path.join(outputPlan.outputDir, `${baseName}.html`);

    if (!outputPlan.force && fileExists(targetFile)) {
      logger.warn(`${prefix}Skipping '${baseName}.html' because file already exists. Use '--force' to overwrite.`);
      continue;
    }

    try {
      progressUpdate(logger, `${prefix}${sourceLabel} - read`);
      const content = await readTextFile(filepath);
      if (!content.trim()) {
        logger.warn(`${prefix}Skipping '${path.basename(filepath)}' because file is empty.`);
        continue;
      }

      const html = await renderMarkdownDocument(runtime, content, 0, baseDir, {
        logger,
        prefix,
        sourceLabel,
      });
      const documents: Record<string, string> = { index: html };
      const batchConfig = { ...runtime.config, output_file: targetFile };
      await buildAndWriteSingleOutput({
        config: batchConfig,
        templateData: runtime.templateData,
        pluginManager: runtime.pluginManager,
        outputFile: targetFile,
        documents,
        i18nStrings,
        localeNames: runtime.localeNames,
        libCss: runtime.libCss,
        libJs: runtime.libJs,
        progress: {
          logger,
          prefix,
          stepLabel: `${sourceLabel} - finalize`,
        },
      });
      successCount++;
    } catch (e) {
      logger.warn(`${prefix}Failed to process '${path.basename(filepath)}': ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (successCount === 0) {
    fail("No files were successfully converted.");
  }
}
export async function runCli(logger: CliPipelineLogger, argv?: string[]): Promise<void> {
  progressStart(logger, "Initializing CLI");
  const args = parseArgs(argv);
  const packageRoot = resolvePackageRoot();

  if (args.templateDev) {
    progressStop(logger);
    await runTemplateDevLauncher(args, logger, packageRoot);
    return;
  }

  const cliOverride = cliArgsToConfig(args);
  const toml = args.configPath
    ? await loadConfigFile(path.resolve(process.cwd(), args.configPath))
    : {};

  progressUpdate(logger, "Loading config");
  const config = buildConfig(toml, cliOverride);
  normalizeConfigPaths(config, packageRoot);

  progressUpdate(logger, "Resolving inputs");
  const resolvedInputs = classifyInputs(args, resolveInputs(args, config), config);
  const outputPlan = resolveOutputPlan(args, config, resolvedInputs);

  const pluginManager = new PluginManager();
  progressUpdate(logger, "Preflight validation");
  runPreflightValidation(config, pluginManager, logger);

  progressUpdate(logger, "Loading template");
  const templateContext = await resolveTemplateContext(config, logger, packageRoot);
  progressUpdate(logger, "Collecting plugin assets");
  const assets = await pluginManager.getAssets(
    config,
    (_phase, pluginName) => progressUpdate(logger, `Collecting plugin assets - ${pluginName}`),
  );
  progressUpdate(logger, "Loading locale name map");
  const localeNames = await loadLocaleNamesConfig(config.locales_dir);
  const runtime = createRuntimeContext(
    config,
    templateContext,
    pluginManager,
    localeNames,
    assets.css,
    assets.js,
  );

  if (resolvedInputs.isSingleFile) {
    await runSingleFileMode(runtime, resolvedInputs.inputFiles[0], outputPlan.outputFile, logger);
  } else if (resolvedInputs.mergeMode) {
    await runMergeMode(runtime, resolvedInputs, outputPlan.outputFile, logger);
  } else {
    await runBatchMode(runtime, resolvedInputs, outputPlan, logger);
  }

  if (resolvedInputs.mergeMode || resolvedInputs.isSingleFile) {
    const sizeBytes = await getFileSizeBytes(outputPlan.outputFile);
    logger.outputLine(outputPlan.outputFile, sizeBytes);
  }
  progressStop(logger);
}
