// ============================================================
// src/cli/main.ts — CLI Orchestrator 
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import { cliArgsToConfig } from "../core/config.js";
import { validateConfig } from "../core/validator.js";
import { markdownToHtml } from "../core/markdown.js";
import { getAllTemplateStrings, getAllLocalesTemplateStrings } from "../core/i18n.js";
import { buildHtml } from "../core/builder.js";
import {
  loadEnvFile,
  loadConfigFile,
  buildConfig,
} from "../adapters/node/config_loader.js";
import {
  scanMarkdownFiles,
  scanLocaleSubDirs,
  scanTemplates,
  loadTemplateFiles,
  loadLibFiles,
  loadLocaleFile,
  loadTemplateLocaleFile,
  readTextFile,
  writeTextFile,
  ensureDir,
  fileExists,
  dirExists,
  isMdFile,
  embedImagesInHtml,
} from "../adapters/node/fs.js";
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

async function main(): Promise<void> {
  const packageRoot = resolvePackageRoot();

  // ① 解析 CLI 引數
  const args = parseArgs();
  const cliOverride = cliArgsToConfig(args);

  // ② 載入 .env + config.toml，合併設定（CLI > env > toml > default）
  loadEnvFile();
  const toml = await loadConfigFile();
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
    console.error("[Error] No input specified. Usage: mdsone <inputs...> [-o output_path] [-f <boolean>]");
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
  const inputDirs  = inputs.filter((p) => dirExists(p));

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
  const isMultiFile  = inputFiles.length > 1;
  const isFolder     = inputDirs.length === 1;

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

  // ⑥ 解析輸出路徑
  let outputFile: string;
  if (args.output) {
    outputFile = path.resolve(process.cwd(), args.output);
  } else if (isSingleFile) {
    const base = path.basename(inputFiles[0], path.extname(inputFiles[0])) + ".html";
    outputFile = path.join(process.cwd(), base);
  } else if (isFolder) {
    const base = path.basename(inputDirs[0]) + ".html";
    outputFile = path.join(process.cwd(), base);
  } else {
    // isMultiFile 且無 -o
    console.error("[Error] Multiple input files detected. Please provide an output filename using '-o <name>.html'.");
    process.exit(1);
  }

  // ⑦ 驗證輸出路徑不是現有資料夾
  if (dirExists(outputFile)) {
    console.error(`[Error] Output path '${outputFile}' is an existing directory. Please specify a file path.`);
    process.exit(1);
  }

  // ⑧ force 保護：-f false 時若目標已存在則中止
  const force = args.force !== "false";
  if (!force && fileExists(outputFile)) {
    console.error("[Error] Output file already exists. Use '-f true' to overwrite.");
    process.exit(1);
  }

  // 同步至 config.output_file（供 buildHtml 等函式使用）
  config.output_file = outputFile;

  // ⑨ 驗證 template 設定（validateConfig 只驗 default_template）
  const logicResult = validateConfig(config);
  if (!logicResult.valid) {
    for (const err of logicResult.errors) console.error(`[ERROR] ${err}`);
    process.exit(1);
  }

  // ⑩ 確認 template 存在
  const availableTemplates = await scanTemplates(config.templates_dir);
  if (availableTemplates.length === 0) {
    console.error("[ERROR] No templates found.");
    process.exit(1);
  }
  const templateName = config.default_template;
  if (!availableTemplates.includes(templateName)) {
    console.error(`[ERROR] Template not found: ${templateName}`);
    console.error(`[ERROR] Available: ${availableTemplates.join(", ")}`);
    process.exit(1);
  }

  // ⑪ 載入 template 檔案（I/O）
  let templateData;
  try {
    templateData = await loadTemplateFiles(
      config.templates_dir,
      templateName,
      config.template_config_file,
    );
  } catch (e) {
    console.error(`[ERROR] Failed to load template: ${e}`);
    process.exit(1);
  }

  // ⑪-b 載入 lib/ 檔案（依 config 旗標決定是否注入 highlight / copy）
  const libDir = path.resolve(packageRoot, "lib");
  const { css: libCss, js: libJs } = await loadLibFiles(libDir, config);

  // ⑫ 讀取 Markdown 並轉換，準備 buildHtml 所需參數
  if (isSingleFile) {
    // ── 單個文件模式 ──
    const srcFile = inputFiles[0];
    try {
      const fileContent = await readTextFile(srcFile);
      if (!fileContent.trim()) {
        console.error("[ERROR] Markdown file is empty.");
        process.exit(1);
      }

      const documents: Record<string, string> = {};
      let html = markdownToHtml(fileContent, config.markdown_extensions, config.code_highlight);
      if (config.img_to_base64) {
        const baseDir = path.dirname(srcFile);
        html = await embedImagesInHtml(html, baseDir, {
          maxWidth: config.img_max_width || undefined,
          compress: config.img_compress || undefined,
        });
      }
      documents["index"] = html;

      const globalLocale = await loadLocaleFile(config.locales_dir, config.locale || "en");
      const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, config.locale || "en");
      const localeFile = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
      const buildDate = resolveBuildDate(config);
      const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

      const htmlContent = buildHtml({ config, templateData, documents, i18nStrings, libCss, libJs });
      await writeOutput(outputFile, htmlContent);
    } catch (e) {
      console.error(`[ERROR] Failed to read markdown file: ${e}`);
      process.exit(1);
    }
  } else if (isMultiFile) {
    // ── 多檔案合併模式（依 inputs 輸入順序）──
    const documents: Record<string, string> = {};
    for (const filepath of inputFiles) {
      const tabName = path.basename(filepath, path.extname(filepath));
      try {
        const content = await readTextFile(filepath);
        if (content.trim()) {
          let html = markdownToHtml(content, config.markdown_extensions, config.code_highlight);
          if (config.img_to_base64) {
            html = await embedImagesInHtml(html, path.dirname(filepath), {
              maxWidth: config.img_max_width || undefined,
              compress: config.img_compress || undefined,
            });
          }
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

    const globalLocale = await loadLocaleFile(config.locales_dir, config.locale || "en");
    const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, config.locale || "en");
    const localeFile = tplLocale?.template
      ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
      : globalLocale;
    const buildDate = resolveBuildDate(config);
    const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

    const htmlContent = buildHtml({ config, templateData, documents, i18nStrings, libCss, libJs });
    await writeOutput(outputFile, htmlContent);
  } else if (config.i18n_mode) {
    // ── 多語模式（資料夾，含 [locale] 子資料夾）──
    const folderPath = inputDirs[0];
    const localeDirs = await scanLocaleSubDirs(folderPath);
    if (Object.keys(localeDirs).length === 0) {
      console.error(`[ERROR] No [locale] subdirectories found in: ${folderPath}`);
      process.exit(1);
    }

    const multiDocuments: Record<string, Record<string, string>> = {};
    for (const [locale, dir] of Object.entries(localeDirs)) {
      const mdFiles = await scanMarkdownFiles(dir);
      const localeDocs: Record<string, string> = {};
      for (const { filename, filepath } of mdFiles) {
        const tabName = filename.replace(/\.(md|markdown)$/i, "");
        try {
          const content = await readTextFile(filepath);
          if (content.trim()) {
            let html = markdownToHtml(content, config.markdown_extensions, config.code_highlight);
            if (config.img_to_base64) {
              html = await embedImagesInHtml(html, dir, {
                maxWidth: config.img_max_width || undefined,
                compress: config.img_compress || undefined,
              });
            }
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
      const globalLocale = await loadLocaleFile(config.locales_dir, locale);
      const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, locale);
      localeFileMap[locale] = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
    }
    const buildDate = resolveBuildDate(config);
    const multiI18nStrings = getAllLocalesTemplateStrings(localeFileMap, buildDate);

    const htmlContent = buildHtml({ config, templateData, multiDocuments, multiI18nStrings, libCss, libJs });
    await writeOutput(outputFile, htmlContent);
  } else {
    // ── 單語資料夾模式 ──
    const folderPath = inputDirs[0];
    const mdFiles = await scanMarkdownFiles(folderPath);
    if (mdFiles.length === 0) {
      console.error(`[ERROR] No .md files found in: ${folderPath}`);
      process.exit(1);
    }

    const documents: Record<string, string> = {};
    for (const { filename, filepath } of mdFiles) {
      const tabName = filename.replace(/\.(md|markdown)$/i, "");
      try {
        const content = await readTextFile(filepath);
        if (content.trim()) {
          let html = markdownToHtml(content, config.markdown_extensions, config.code_highlight);
          if (config.img_to_base64) {
            html = await embedImagesInHtml(html, folderPath, {
              maxWidth: config.img_max_width || undefined,
              compress: config.img_compress || undefined,
            });
          }
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

    const globalLocale = await loadLocaleFile(config.locales_dir, config.locale);
    const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, config.locale);
    const localeFile = tplLocale?.template
      ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
      : globalLocale;
    const buildDate = resolveBuildDate(config);
    const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

    const htmlContent = buildHtml({ config, templateData, documents, i18nStrings, libCss, libJs });
    await writeOutput(outputFile, htmlContent);
  }

  // ⑬ 印出等效指令
  const tpl = config.default_template;
  const inputsStr = inputs.map((p) => `"${p}"`).join(" ");
  const parts = [`npx mdsone ${inputsStr}`];
  if (tpl !== "normal") parts.push(`--template ${tpl}`);
  if (config.i18n_mode) parts.push(`--i18n-mode true`);
  else if (config.locale !== "en") parts.push(`--locale ${config.locale}`);
  if (args.output) parts.push(`-o "${outputFile}"`);
  console.info(`[INFO] ${parts.join(" ")}`);
  console.info(`[INFO] Output: ${outputFile}`);
}

function resolveBuildDate(config: Config): string {
  if (config.build_date) return config.build_date;
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
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

