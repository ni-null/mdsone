// ============================================================
// src/cli/main.ts — CLI Orchestrator 
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import { cliArgsToConfig } from "../core/config.js";
import { validateConfig } from "../core/validator.js";
import { resolveBuildDate } from "../core/build-date.js";
import { markdownToHtml } from "../core/markdown.js";
import { getAllTemplateStrings, getAllLocalesTemplateStrings } from "../core/i18n.js";
import { buildHtml } from "../core/builder.js";
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
import { PluginManager } from "../plugins/manager.js";
import type { Config } from "../core/types.js";

/**
 * 取得套件根目錄的絕對路徑。
 * 透過 npx / npm global 執行時，CWD 是使用者目錄，
 * 需以此函數定位內建 templates / locales 資源。
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
    } catch { /* fall through */ }
  }
  return process.cwd();
}

function isTemplateFolder(templateDir: string): boolean {
  return (
    dirExists(templateDir) &&
    fileExists(path.join(templateDir, "style.css")) &&
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
    throw new Error("Invalid --template value: missing template before '@'.");
  }
  if (!variant) {
    throw new Error("Invalid --template value: missing variant after '@'.");
  }
  return { template, variant };
}

async function main(): Promise<void> {
  const packageRoot = resolvePackageRoot();

  // ① 解析 CLI 引數
  const args = parseArgs();
  const cliOverride = cliArgsToConfig(args);
  const runAsync = async <T>(
    labelOrFn: string | (() => Promise<T>),
    maybeFn?: () => Promise<T>,
  ): Promise<T> => {
    const fn = typeof labelOrFn === "function" ? labelOrFn : maybeFn;
    if (!fn) {
      throw new TypeError("runAsync requires a function callback.");
    }
    return await fn();
  };
  const runSync = <T>(fn: () => T): T => fn();

  // ② 載入（可選）config.toml，合併設定（CLI > env > toml > default）
  let toml = {};
  if (args.configPath) {
    const cfgPath = path.resolve(process.cwd(), args.configPath);
    toml = await loadConfigFile(cfgPath);
  }
  let config: Config = buildConfig(toml, cliOverride);

  // ②-b 將相對路徑的 templates_dir / locales_dir 以 packageRoot 為基準解析
  if (!path.isAbsolute(config.templates_dir)) {
    config.templates_dir = path.resolve(packageRoot, config.templates_dir);
  }
  if (!path.isAbsolute(config.locales_dir)) {
    config.locales_dir = path.resolve(packageRoot, config.locales_dir);
  }

  // ③ 決定輸入來源（CLI positional args 優先，否則 fallback 至 config.toml）
  let inputs: string[] = (args.inputs ?? []).map((p) => path.resolve(process.cwd(), p));

  if (inputs.length === 0 && config.markdown_source_dir) {
    inputs = [path.resolve(process.cwd(), config.markdown_source_dir)];
  }

  if (inputs.length === 0) {
    console.error("[Error] No input specified. Usage: mdsone <inputs...> [-o output_path] [-f]");
    process.exit(1);
  }

  // ④ 確認每個 input 路徑存在
  for (const input of inputs) {
    if (!fileExists(input) && !dirExists(input)) {
      console.error(`[Error] Cannot find input file/directory: ${input}`);
      process.exit(1);
    }
  }

  // ④-b 分類：檔案 vs 資料夾
  const inputFiles = inputs.filter((p) => fileExists(p));
  const inputDirs = inputs.filter((p) => dirExists(p));

  if (inputFiles.length > 0 && inputDirs.length > 0) {
    console.error("[Error] Mixed input (files and directories) is not supported. Please provide either a list of files OR a single directory.");
    process.exit(1);
  }

  if (inputDirs.length > 1) {
    console.error("[Error] Only a single directory is supported as input.");
    process.exit(1);
  }

  // ⑤ 決定模式
  const isSingleFile = inputFiles.length === 1 && isMdFile(inputFiles[0]);
  const isMultiFile = inputFiles.length > 1;
  const isFolder = inputDirs.length === 1;

  // ⑤-a 檢查檔案類型：所有檔案輸入必須是 markdown
  if (inputFiles.length > 0) {
    const invalidFiles = inputFiles.filter(f => !isMdFile(f));
    if (invalidFiles.length > 0) {
      const msg = invalidFiles.length === inputFiles.length && inputFiles.length === 1
        ? `Expected .md or .markdown file, got '${path.extname(invalidFiles[0]) || '(no extension)'}'`
        : `Not all files are markdown: ${invalidFiles.map(p => path.basename(p)).join(', ')}`;
      console.error(`[Error] Invalid input file(s). ${msg}`);
      process.exit(1);
    }
  }

  // ⑤.₁ i18n 模式必須是單一資料夾
  if (config.i18n_mode && !isFolder) {
    console.error("[Error] i18n mode only supports a single folder as input.");
    process.exit(1);
  }

  // ⑤.₂ 決定合併模式（-m 旗標 或 i18n 模式兩者皆走合併邏輯）
  const mergeMode = !!args.merge || config.i18n_mode;

  // ⑤.₃ 批次資料夾模式必須明確指定 -o（輸出目錄）
  if (!mergeMode && isFolder && !args.output) {
    console.error("[Error] Batch folder mode requires an output directory. Use '-o <dir>' to specify where HTML files should be written.");
    process.exit(1);
  }

  // ⑥ 解析輸出路徑
  const force = args.force === true;
  let outputFile = "";     // 合併模式的最終輸出檔案
  let outputDir = "";     // 批次模式的輸出目錄

  if (mergeMode) {
    // ── 合併模式：輸出必為單一 HTML 檔案 ──
    if (args.output) {
      outputFile = path.resolve(process.cwd(), args.output);
      // -o 不可指向現有目錄
      if (dirExists(outputFile)) {
        console.error(`[Error] In merge mode, '-o' must be a file path, not a directory: '${args.output}'`);
        process.exit(1);
      }
    } else if (isFolder) {
      // 取資料夾名稱作為預設檔名；若名稱為空或 "." 則 fallback merge.html
      const dirName = path.basename(inputDirs[0]);
      const baseName = (dirName && dirName !== ".") ? dirName : "merge";
      outputFile = path.join(process.cwd(), baseName + ".html");
    } else {
      // 多檔 / 單檔 -m：預設 merge.html
      outputFile = path.join(process.cwd(), "merge.html");
    }

    // ⑦ 未指定 --force 時，若輸出已存在則中止
    if (!force && fileExists(outputFile)) {
      console.error("[Error] Output file already exists. Use '--force' to overwrite.");
      process.exit(1);
    }

    // 同步至 config.output_file
    config.output_file = outputFile;

  } else if (isSingleFile) {
    // ── 批次單檔模式 ──
    if (args.output) {
      outputFile = path.resolve(process.cwd(), args.output);
      if (dirExists(outputFile)) {
        console.error(`[Error] Output path '${outputFile}' is an existing directory. Please specify a file path.`);
        process.exit(1);
      }
    } else {
      const base = path.basename(inputFiles[0], path.extname(inputFiles[0])) + ".html";
      outputFile = path.join(process.cwd(), base);
    }

    // ⑦ 未指定 --force 時，若輸出已存在則中止
    if (!force && fileExists(outputFile)) {
      console.error("[Error] Output file already exists. Use '--force' to overwrite.");
      process.exit(1);
    }

    config.output_file = outputFile;

  } else {
    // ── 批次多檔 / 批次資料夾模式 ──
    if (args.output) {
      outputDir = path.resolve(process.cwd(), args.output);
      // -o 不可含副檔名（代表使用者誤傳了檔案路徑）
      if (path.extname(outputDir) !== "") {
        console.error(`[Error] In batch mode, '-o' must be a directory path, not a file path: '${args.output}'`);
        process.exit(1);
      }
      // -o 不可指向現有檔案
      if (fileExists(outputDir)) {
        console.error(`[Error] Output path '${args.output}' is an existing file. Please specify a directory path.`);
        process.exit(1);
      }
    } else {
      // isMultiFile 且無 -o → 輸出至 CWD
      outputDir = process.cwd();
    }

    config.output_file = outputDir;
  }

  // ⑨ 驗證 template 設定（validateConfig 只驗 default_template）
  const logicResult = validateConfig(config);
  if (!logicResult.valid) {
    for (const err of logicResult.errors) console.error(`[ERROR] ${err}`);
    process.exit(1);
  }

  // ⑩ 解析 template 來源：名稱或資料夾路徑
  let templateRootDir = config.templates_dir;
  const rawTemplateSpec = (config.default_template || "").trim();
  let parsedTemplate: { template: string; variant: string };
  try {
    parsedTemplate = parseTemplateSpec(rawTemplateSpec);
  } catch (e) {
    console.error(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const rawTemplate = parsedTemplate.template;
  config.default_template = rawTemplate;
  config.template_variant = parsedTemplate.variant;
  let templateName = rawTemplate;
  const templateLooksLikePath = path.isAbsolute(rawTemplate) || rawTemplate.includes("/") || rawTemplate.includes("\\");
  if (templateLooksLikePath) {
    const templateDir = path.isAbsolute(rawTemplate)
      ? rawTemplate
      : path.resolve(process.cwd(), rawTemplate);
    if (!isTemplateFolder(templateDir)) {
      console.error(`[ERROR] Template folder is invalid: ${templateDir}`);
      console.error("[ERROR] Expected files: style.css, template.html");
      process.exit(1);
    }
    templateRootDir = path.dirname(templateDir);
    templateName = path.basename(templateDir);
  }

  // ⑩-b 確認 template 存在
  const availableTemplates = await runAsync(() => scanTemplates(templateRootDir));
  if (availableTemplates.length === 0) {
    console.error(`[ERROR] No templates found in: ${templateRootDir}`);
    process.exit(1);
  }
  if (!availableTemplates.includes(templateName)) {
    console.error(`[ERROR] Template not found: ${templateName}`);
    console.error(`[ERROR] Available: ${availableTemplates.join(", ")}`);
    process.exit(1);
  }

  // ⑪ 載入 template 檔案（I/O）
  let templateData;
  try {
    templateData = await runAsync(() => loadTemplateFiles(
      templateRootDir,
      templateName,
    ));
  } catch (e) {
    console.error(`[ERROR] Failed to load template: ${e}`);
    process.exit(1);
  }

  const variantName = config.template_variant || "default";
  if (templateData.config.types && !templateData.config.types[variantName]) {
    console.warn(`[WARN] template variant '${variantName}' not found. Falling back to 'default'.`);
    config.template_variant = "default";
  }

  // ⑪-b 透過 PluginManager 收集 plugin 靜態資源
  const pluginManager = new PluginManager();
  const renderMarkdownWithPlugins = (
    markdownText: string,
    fileIndex: number,
    sourceDir: string,
  ): string => {
    return markdownToHtml(
      markdownText,
      config.markdown_extensions,
      fileIndex,
      (md) => pluginManager.extendMarkdown(md, config, { sourceDir, templateData }),
    );
  };
  const { css: libCss, js: libJs } = await runAsync(() => pluginManager.getAssets(config));
  const localeNames = await runAsync(() => loadLocaleNamesConfig(config.locales_dir));

  // ⑫ 讀取 Markdown 並轉換，準備 buildHtml 所需參數
  if (isSingleFile) {
    // ── 單個文件模式（批次或合併，行為相同）──
    const srcFile = inputFiles[0];
    try {
      const fileContent = await runAsync(() => readTextFile(srcFile));
      if (!fileContent.trim()) {
        console.error("[ERROR] Markdown file is empty.");
        process.exit(1);
      }

      const documents: Record<string, string> = {};
      let html = runSync(() => renderMarkdownWithPlugins(fileContent, 0, path.dirname(srcFile)));
      html = await runAsync(
        () => pluginManager.processHtml(
          html,
          config,
          { sourceDir: path.dirname(srcFile), templateData }
        ),
      );
      documents["index"] = html;

      const globalLocale = await runAsync(() => loadLocaleFile(config.locales_dir, config.locale || "en"));
      const tplLocale = await runAsync(() => loadTemplateLocaleFile(templateRootDir, templateName, config.locale || "en"));
      const localeFile = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
      const buildDate = resolveBuildDate(config);
      const i18nStrings = runSync(() => getAllTemplateStrings(localeFile, buildDate));

      let htmlContent = runSync(() => buildHtml({ config, templateData, documents, i18nStrings, localeNames, libCss, libJs }));
      htmlContent = await runAsync(() => pluginManager.processOutputHtml(htmlContent, config));
      await runAsync(() => writeOutput(outputFile, htmlContent));
    } catch (e) {
      console.error(`[ERROR] Failed to read markdown file: ${e}`);
      process.exit(1);
    }
  } else if (mergeMode) {
    // ── 合併模式：多檔案 / 資料夾 → 單一 HTML ──
    if (isMultiFile) {
      // 多檔案合併（依 inputs 輸入順序）
      const documents: Record<string, string> = {};
      for (const [i, filepath] of inputFiles.entries()) {
        const tabName = path.basename(filepath, path.extname(filepath));
        try {
          const content = await runAsync(() => readTextFile(filepath));
          if (content.trim()) {
            let html = runSync(() => renderMarkdownWithPlugins(content, i, path.dirname(filepath)));
            html = await runAsync(
              () => pluginManager.processHtml(
                html,
                config,
                { sourceDir: path.dirname(filepath), templateData }
              ),
            );
            documents[tabName] = html;
          }
        } catch (e) {
          console.warn(`[WARN] Failed to read ${filepath}: ${e}`);
        }
      }

      if (Object.keys(documents).length === 0) {
        console.error("[ERROR] No content generated.");
        process.exit(1);
      }

      const globalLocale = await runAsync(() => loadLocaleFile(config.locales_dir, config.locale || "en"));
      const tplLocale = await runAsync(() => loadTemplateLocaleFile(templateRootDir, templateName, config.locale || "en"));
      const localeFile = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
      const buildDate = resolveBuildDate(config);
      const i18nStrings = runSync(() => getAllTemplateStrings(localeFile, buildDate));

      let htmlContent = runSync(() => buildHtml({ config, templateData, documents, i18nStrings, localeNames, libCss, libJs }));
      htmlContent = await runAsync(() => pluginManager.processOutputHtml(htmlContent, config));
      await runAsync(() => writeOutput(outputFile, htmlContent));
    } else if (config.i18n_mode) {
      // 多語模式（資料夾，含 [locale] 子資料夾）
      const folderPath = inputDirs[0];
      const localeDirs = await runAsync(() => scanLocaleSubDirs(folderPath));
      if (Object.keys(localeDirs).length === 0) {
        console.error(`[ERROR] No [locale] subdirectories found in: ${folderPath}`);
        process.exit(1);
      }

      const multiDocuments: Record<string, Record<string, string>> = {};
      for (const [locale, dir] of Object.entries(localeDirs)) {
        const mdFiles = await runAsync(() => scanMarkdownFiles(dir));
        const localeDocs: Record<string, string> = {};
        for (const [idx, { filename, filepath }] of mdFiles.entries()) {
          const tabName = filename.replace(/\.(md|markdown)$/i, "");
          try {
            const content = await runAsync(() => readTextFile(filepath));
            if (content.trim()) {
              let html = runSync(() => renderMarkdownWithPlugins(content, idx, dir));
              html = await runAsync(
                () => pluginManager.processHtml(
                  html,
                  config,
                  { sourceDir: dir, templateData }
                ),
              );
              localeDocs[tabName] = html;
            }
          } catch (e) {
            console.warn(`[WARN] Failed to read ${filepath}: ${e}`);
          }
        }
        if (Object.keys(localeDocs).length > 0) {
          multiDocuments[locale] = localeDocs;
        }
      }

      if (Object.keys(multiDocuments).length === 0) {
        console.error("[ERROR] No content generated in i18n mode.");
        process.exit(1);
      }

      const locales = Object.keys(multiDocuments);
      const localeFileMap: Record<string, Awaited<ReturnType<typeof loadLocaleFile>>> = {};
      for (const locale of locales) {
        const globalLocale = await runAsync(() => loadLocaleFile(config.locales_dir, locale));
        const tplLocale = await runAsync(() => loadTemplateLocaleFile(templateRootDir, templateName, locale));
        localeFileMap[locale] = tplLocale?.template
          ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
          : globalLocale;
      }
      const buildDate = resolveBuildDate(config);
      const multiI18nStrings = runSync(() => getAllLocalesTemplateStrings(localeFileMap, buildDate));

      let htmlContent = runSync(() => buildHtml({ config, templateData, multiDocuments, multiI18nStrings, localeNames, libCss, libJs }));
      htmlContent = await runAsync(() => pluginManager.processOutputHtml(htmlContent, config));
      await runAsync(() => writeOutput(outputFile, htmlContent));
    } else {
      // 單語資料夾合併
      const folderPath = inputDirs[0];
      const mdFiles = await runAsync(() => scanMarkdownFiles(folderPath));
      if (mdFiles.length === 0) {
        console.error(`[ERROR] No .md files found in: ${folderPath}`);
        process.exit(1);
      }

      const documents: Record<string, string> = {};
      for (const [idx, { filename, filepath }] of mdFiles.entries()) {
        const tabName = filename.replace(/\.(md|markdown)$/i, "");
        try {
          const content = await runAsync(() => readTextFile(filepath));
          if (content.trim()) {
            let html = runSync(() => renderMarkdownWithPlugins(content, idx, folderPath));
            html = await runAsync(
              () => pluginManager.processHtml(
                html,
                config,
                { sourceDir: folderPath, templateData }
              ),
            );
            documents[tabName] = html;
          }
        } catch (e) {
          console.warn(`[WARN] Failed to read ${filepath}: ${e}`);
        }
      }

      if (Object.keys(documents).length === 0) {
        console.error("[ERROR] No content generated.");
        process.exit(1);
      }

      const globalLocale = await runAsync(() => loadLocaleFile(config.locales_dir, config.locale));
      const tplLocale = await runAsync(() => loadTemplateLocaleFile(templateRootDir, templateName, config.locale));
      const localeFile = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
      const buildDate = resolveBuildDate(config);
      const i18nStrings = runSync(() => getAllTemplateStrings(localeFile, buildDate));

      let htmlContent = runSync(() => buildHtml({ config, templateData, documents, i18nStrings, localeNames, libCss, libJs }));
      htmlContent = await runAsync(() => pluginManager.processOutputHtml(htmlContent, config));
      await runAsync(() => writeOutput(outputFile, htmlContent));
    }
  } else {
    // ── 批次多檔 / 批次資料夾模式：每個 .md 獨立產生一個 HTML ──
    type BatchEntry = { filepath: string; baseName: string; baseDir: string };
    const batchFiles: BatchEntry[] = [];

    if (isMultiFile) {
      for (const f of inputFiles) {
        batchFiles.push({ filepath: f, baseName: path.basename(f, path.extname(f)), baseDir: path.dirname(f) });
      }
    } else {
      // isFolder
      const mdFiles = await runAsync(() => scanMarkdownFiles(inputDirs[0]));
      for (const { filename, filepath } of mdFiles) {
        batchFiles.push({
          filepath,
          baseName: filename.replace(/\.(md|markdown)$/i, ""),
          baseDir: inputDirs[0],
        });
      }
    }

    if (batchFiles.length === 0) {
      console.error("[ERROR] No .md files found.");
      process.exit(1);
    }

    await runAsync(() => ensureDir(outputDir));

    // 載入共用 locale（批次中所有檔案共用同一組 i18n 字串）
    const globalLocale = await runAsync(() => loadLocaleFile(config.locales_dir, config.locale || "en"));
    const tplLocale = await runAsync(() => loadTemplateLocaleFile(templateRootDir, templateName, config.locale || "en"));
    const localeFile = tplLocale?.template
      ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
      : globalLocale;
    const buildDate = resolveBuildDate(config);
    const i18nStrings = runSync(() => getAllTemplateStrings(localeFile, buildDate));

    let successCount = 0;
    for (const { filepath, baseName, baseDir } of batchFiles) {
      const targetFile = path.join(outputDir, baseName + ".html");

      // 未指定 --force：目標已存在則 WARN 並跳過（不中止整批）
      if (!force && fileExists(targetFile)) {
        console.warn(`[WARN] Skipping '${baseName}.html' — file already exists. Use '--force' to overwrite.`);
        continue;
      }

      try {
        const content = await runAsync(() => readTextFile(filepath));
        if (!content.trim()) {
          console.warn(`[WARN] Skipping '${path.basename(filepath)}' — file is empty.`);
          continue;
        }
        let html = runSync(() => renderMarkdownWithPlugins(content, 0, baseDir));
        html = await runAsync(
          () => pluginManager.processHtml(
            html,
            config,
            { sourceDir: baseDir, templateData }
          ),
        );
        const documents: Record<string, string> = { index: html };
        // 每個批次檔案有自己的 config.output_file（供 template 使用）
        const batchConfig = { ...config, output_file: targetFile };
        let htmlContent = runSync(() => buildHtml({ config: batchConfig, templateData, documents, i18nStrings, localeNames, libCss, libJs }));
        htmlContent = await runAsync(() => pluginManager.processOutputHtml(htmlContent, batchConfig));
        await runAsync(() => writeOutput(targetFile, htmlContent));
        successCount++;
      } catch (e) {
        console.warn(`[WARN] Failed to process '${path.basename(filepath)}': ${e}`);
      }
    }

    if (successCount === 0) {
      console.error("[ERROR] No files were successfully converted.");
      process.exit(1);
    }

    console.info(`[INFO] Batch complete: ${successCount}/${batchFiles.length} file(s) → ${outputDir}`);
  }

  if (mergeMode || isSingleFile) {
    console.info(`[INFO] Output: ${outputFile}`);
  }
}

async function writeOutput(outputFile: string, content: string): Promise<void> {
  try {
    const dir = path.dirname(outputFile);
    if (dir && dir !== ".") await ensureDir(dir);
    await writeTextFile(outputFile, content);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("EACCES") || msg.includes("EPERM")) {
      console.error(`[Error] Permission denied: Cannot write to ${outputFile}`);
    } else {
      console.error(`[ERROR] Failed to write output: ${e}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[ERROR] Unexpected error: ${e}`);
  process.exit(1);
});
