// ============================================================
// src/cli/main.ts — CLI Orchestrator 
// ============================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./args.js";
import { cliArgsToConfig, resolveOutputFile } from "../core/config.js";
import { validateConfig } from "../core/validator.js";
import { markdownToHtml } from "../core/markdown.js";
import { getAllTemplateStrings, getAllLocalesTemplateStrings } from "../core/i18n.js";
import { buildHtml } from "../core/builder.js";
import {
  loadEnvFile,
  loadConfigFile,
  buildConfig,
  validateDirExists,
} from "../adapters/node/config_loader.js";
import { promptMissingPaths } from "../adapters/node/folder_picker.js";
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
  // 1. import.meta.url 有值時（正常 ESM 執行）
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
  // 2. tsx / --eval 模式：import.meta.url 為 undefined → 用 CWD
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
  //      若使用者 config.toml 已給絕對路徑則不影響
  if (!path.isAbsolute(config.templates_dir)) {
    config.templates_dir = path.resolve(packageRoot, config.templates_dir);
  }
  if (!path.isAbsolute(config.locales_dir)) {
    config.locales_dir = path.resolve(packageRoot, config.locales_dir);
  }

  // ③ 解析 output_file（--output-dir + --output-filename 組合）
  config.output_file = resolveOutputFile(config, !!args.output, path.join);

  // ③-b 單一 .md 檔案來源：若未明確指定輸出位置，自動輸出到來源同目錄
  if (fileExists(config.markdown_source_dir) && isMdFile(config.markdown_source_dir)
    && !args.output && !args.outputDir) {
    const sourceDir = path.dirname(path.resolve(config.markdown_source_dir));
    const outName = config.output_filename || "main.html";
    config.output_file = path.join(sourceDir, outName);
  }

  // ④ 原生資料夾選擇器（Windows / macOS，僅在路徑未指定且目錄不存在時觸發）
  const pickerResult = await promptMissingPaths(
    config,
    args.source,
    args.output,
    args.outputDir,
  );
  if (pickerResult === null) {
    console.error("[ERROR] No folder selected. Exiting.");
    process.exit(1);
  }
  if (Object.keys(pickerResult).length > 0) {
    config = { ...config, ...pickerResult };
  }

  // ⑤ 邏輯驗證（純函數）
  const logicResult = validateConfig(config);
  if (!logicResult.valid) {
    for (const err of logicResult.errors) console.error(`[ERROR] ${err}`);
    process.exit(1);
  }

  // ⑥ fs 驗證：來源是文件還是目錄
  let isSingleFile = false;
  if (fileExists(config.markdown_source_dir) && isMdFile(config.markdown_source_dir)) {
    // 單個 Markdown 文件
    isSingleFile = true;
  } else {
    // 應該是目錄
    const fsResult = validateDirExists(config);
    if (!fsResult.valid) {
      for (const err of fsResult.errors) console.error(`[ERROR] ${err}`);
      process.exit(1);
    }
  }

  // ⑦ 確認 template 存在
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

  // ⑧ 載入 template 檔案（I/O）
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

  // ⑧-b 載入 lib/ 檔案（依 config 旗標決定是否注入 highlight / copy）
  const libDir = path.resolve(packageRoot, "lib");
  const { css: libCss, js: libJs } = await loadLibFiles(libDir, config);

  // ⑨ 讀取 Markdown 並轉換，準備 buildHtml 所需參數
  if (isSingleFile) {
    // ── 單個文件模式 ──
    try {
      const fileContent = await readTextFile(config.markdown_source_dir);
      if (!fileContent.trim()) {
        console.error("[ERROR] Markdown file is empty.");
        process.exit(1);
      }

      const documents: Record<string, string> = {};
      let html = markdownToHtml(fileContent, config.markdown_extensions, config.code_highlight);
      if (config.img_to_base64) {
        const baseDir = path.dirname(path.resolve(config.markdown_source_dir));
        html = await embedImagesInHtml(html, baseDir, {
          maxWidth: config.img_max_width || undefined,
          compress: config.img_compress || undefined,
        });
      }
      documents["index"] = html;

      // 載入 i18n 字串（全域 cli + 模板專屬 template 合併）
      const globalLocale = await loadLocaleFile(config.locales_dir, config.locale || "en");
      const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, config.locale || "en");
      const localeFile = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
      const buildDate = config.build_date || (() => {
        const d = new Date();
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
      })();
      const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

      // ⑩ 組裝 HTML
      const htmlContent = buildHtml({
        config,
        templateData,
        documents,
        i18nStrings,
        libCss,
        libJs,
      });

      await writeOutput(config.output_file, htmlContent);
    } catch (e) {
      console.error(`[ERROR] Failed to read markdown file: ${e}`);
      process.exit(1);
    }
  } else if (config.i18n_mode) {
    // ── 多語模式 ──
    const localeDirs = await scanLocaleSubDirs(config.markdown_source_dir);
    if (Object.keys(localeDirs).length === 0) {
      console.error(`[ERROR] No [locale] subdirectories found in: ${config.markdown_source_dir}`);
      process.exit(1);
    }

    const multiDocuments: Record<string, Record<string, string>> = {};
    for (const [locale, dir] of Object.entries(localeDirs)) {
      const mdFiles = await scanMarkdownFiles(dir);
      const localeDocs: Record<string, string> = {};
      for (const { filename, filepath } of mdFiles) {
        const tabName = filename.replace(/\.md$/i, "");
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

    // 載入所有 locale 的 i18n 字串（全域 cli + 模板專屬 template 合併）
    const locales = Object.keys(multiDocuments);
    const localeFileMap: Record<string, Awaited<ReturnType<typeof loadLocaleFile>>> = {};
    for (const locale of locales) {
      const globalLocale = await loadLocaleFile(config.locales_dir, locale);
      const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, locale);
      localeFileMap[locale] = tplLocale?.template
        ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
        : globalLocale;
    }
    const buildDate = config.build_date || (() => {
      const d = new Date();
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    })();
    const multiI18nStrings = getAllLocalesTemplateStrings(localeFileMap, buildDate);

    // ⑩ 組裝 HTML
    const htmlContent = buildHtml({
      config,
      templateData,
      multiDocuments,
      multiI18nStrings,
      libCss,
      libJs,
    });

    await writeOutput(config.output_file, htmlContent);
  } else {
    // ── 單語模式 ──
    const mdFiles = await scanMarkdownFiles(config.markdown_source_dir);
    if (mdFiles.length === 0) {
      console.error(`[ERROR] No .md files found in: ${config.markdown_source_dir}`);
      process.exit(1);
    }

    const documents: Record<string, string> = {};
    for (const { filename, filepath } of mdFiles) {
      const tabName = filename.replace(/\.md$/i, "");
      try {
        const content = await readTextFile(filepath);
        if (content.trim()) {
          let html = markdownToHtml(content, config.markdown_extensions, config.code_highlight);
          if (config.img_to_base64) {
            html = await embedImagesInHtml(html, config.markdown_source_dir, {
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

    // 載入 i18n 字串（全域 cli + 模板專屬 template 合併）
    const globalLocale = await loadLocaleFile(config.locales_dir, config.locale);
    const tplLocale = await loadTemplateLocaleFile(config.templates_dir, templateName, config.locale);
    const localeFile = tplLocale?.template
      ? { ...globalLocale, template: { ...(globalLocale.template ?? {}), ...tplLocale.template } }
      : globalLocale;
    const buildDate = config.build_date || (() => {
      const d = new Date();
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    })();
    const i18nStrings = getAllTemplateStrings(localeFile, buildDate);

    // ⑩ 組裝 HTML
    const htmlContent = buildHtml({
      config,
      templateData,
      documents,
      i18nStrings,
      libCss,
      libJs,
    });

    await writeOutput(config.output_file, htmlContent);
  }

  // ⑪ 印出等效指令
  const src = config.markdown_source_dir;
  const tpl = config.default_template;
  const parts = ["npx mdsone"];
  if (tpl !== "normal") parts.push(`--template ${tpl}`);
  if (config.i18n_mode) parts.push(`--i18n-mode true`);
  else if (config.locale !== "en") parts.push(`--locale ${config.locale}`);
  if (args.source) parts.push(`--source "${src}"`);
  if (args.output) parts.push(`--output "${config.output_file}"`);
  console.info(`[INFO] ${parts.join(" ")}`);
  console.info(`[INFO] Output: ${config.output_file}`);
}

async function writeOutput(outputFile: string, content: string): Promise<void> {
  try {
    const dir = path.dirname(outputFile);
    if (dir && dir !== ".") await ensureDir(dir);
    await writeTextFile(outputFile, content);
  } catch (e) {
    console.error(`[ERROR] Failed to write output: ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[ERROR] Unexpected error: ${e}`);
  process.exit(1);
});
