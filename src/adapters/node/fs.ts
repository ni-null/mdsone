// ============================================================
// src/adapters/node/fs.ts ??Node.js 瑼?蝟餌絞??
// ???I/O ?葉?潭迨嚗ore 撅支?? I/O
// ============================================================

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { I18nFile, TemplateData } from "../../core/types.js";
import { LOCALE_DIR_PATTERN } from "../../core/markdown.js";

/** 霈??UTF-8 ??瑼??芸??駁 BOM嚗?*/
export async function readTextFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

/** 撖怠 UTF-8 ??瑼?*/
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

/** ?艘蝣箔??桅?摮 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** 蝣箄??桅??臬摮嚗?甇伐? */
export function dirExists(dirPath: string): boolean {
  try {
    return fsSync.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** 蝣箄?瑼??臬摮嚗?甇伐? */
export function fileExists(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** 蝣箄??臬??Markdown 瑼?嚗??.md ??.markdown嚗?*/
export function isMdFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/**
 * ?曉?桅?銝剜???.md 瑼?嚗??迂????
 * ? [{filename, filepath}, ...]
 */
export async function scanMarkdownFiles(
  dir: string,
): Promise<Array<{ filename: string; filepath: string }>> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((e) => isMdFile(e))
    .sort()
    .map((e) => ({ filename: e, filepath: path.join(dir, e) }));
}

/**
 * ?? [locale] 摮??? { locale_code: absolute_path }??
 * 撠? Python get_locale_dirs()??
 */
export async function scanLocaleSubDirs(
  sourceDir: string,
): Promise<Record<string, string>> {
  let entries: fsSync.Dirent[];
  try {
    entries = (await fs.readdir(sourceDir, { withFileTypes: true })) as fsSync.Dirent[];
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const match = LOCALE_DIR_PATTERN.exec(entry.name);
    if (match) {
      result[match[1]] = path.join(sourceDir, entry.name);
    }
  }
  return result;
}

/**
 * ?曉????template ?迂嚗??????style.css + template.html嚗?
 * 撠? Python get_available_templates()??
 */
export async function scanTemplates(templatesDir: string): Promise<string[]> {
  let entries: fsSync.Dirent[];
  try {
    entries = (await fs.readdir(templatesDir, { withFileTypes: true })) as fsSync.Dirent[];
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(templatesDir, entry.name);
    const hasCss = fsSync.existsSync(path.join(dir, "style.css"));
    const hasHtml = fsSync.existsSync(path.join(dir, "template.html"));
    if (hasCss && hasHtml) names.push(entry.name);
  }
  return names.sort();
}

/**
 * 頛?桐? locale JSON 瑼?嚗銝??fallback ??en.json??
 * 撠? Python I18n.load()??
 */
export async function loadLocaleFile(
  localesDir: string,
  locale: string,
): Promise<I18nFile> {
  let filePath = path.join(localesDir, `${locale}.json`);
  if (!fsSync.existsSync(filePath)) {
    console.warn(`[WARN] Locale file not found: ${filePath}. Falling back to 'en'.`);
    filePath = path.join(localesDir, "en.json");
  }
  const raw = await readTextFile(filePath);
  return JSON.parse(raw) as I18nFile;
}

/**
 * 頛璅⊥撠惇??locale 瑼?嚗???template ?憛???
 * ?曆??唳?? null嚗?怎垢?舀捱摰?fallback 蝑??
 * ?交??嚗?locale>.json ??en.json ??null??
 */
export async function loadTemplateLocaleFile(
  templatesDir: string,
  templateName: string,
  locale: string,
): Promise<Partial<I18nFile> | null> {
  const localesDir = path.join(templatesDir, templateName, "locales");
  let filePath = path.join(localesDir, `${locale}.json`);
  if (!fsSync.existsSync(filePath)) {
    filePath = path.join(localesDir, "en.json");
    if (!fsSync.existsSync(filePath)) return null;
  }
  const raw = await readTextFile(filePath);
  return JSON.parse(raw) as Partial<I18nFile>;
}

/**
 * 頛?? template ????獢?? TemplateData嚗 inline 鞈??批捆嚗?
 * 撠? Python load_template()??
 */
export async function loadTemplateFiles(
  templatesDir: string,
  templateName: string,
): Promise<TemplateData> {
  const templateDir = path.join(templatesDir, templateName);

  const css = await readTextFile(path.join(templateDir, "style.css"));
  const template = await readTextFile(path.join(templateDir, "template.html"));

  // ?身??
  let metadata = {};
  let version = "1.0.0";
  let schema_version = "v1";
  let toc_config = { enabled: false, levels: [2, 3] };

  const configPath = path.join(templateDir, "template.config.json");
  if (fsSync.existsSync(configPath)) {
    try {
      const raw = JSON.parse(await readTextFile(configPath)) as Record<string, unknown>;
      metadata = (raw["_metadata"] ?? {}) as object;
      version = (metadata as Record<string, string>)["version"] ?? "1.0.0";
      schema_version = (metadata as Record<string, string>)["schema_version"] ?? "v1";
      if (raw["toc"]) toc_config = raw["toc"] as typeof toc_config;
    } catch (e) {
      console.warn(`[WARN] Failed to load template config: ${e}`);
    }
  }

  // ?? assets/ 鞈?憭橘??芸??園? CSS / JS 瑼?銝虫??詨??韌??敺?inline 瘜典
  const assetsDir = path.join(templateDir, "assets");
  const assets_css: Array<{ filename: string; content: string }> = [];
  const assets_js: Array<{ filename: string; content: string }> = [];

  if (fsSync.existsSync(assetsDir)) {
    const entries = fsSync.readdirSync(assetsDir);
    const cssFiles = entries.filter(f => f.endsWith(".css")).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    const jsFiles = entries.filter(f => f.endsWith(".js")).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    for (const f of cssFiles) {
      try { assets_css.push({ filename: f, content: await readTextFile(path.join(assetsDir, f)) }); }
      catch (e) { console.warn(`[WARN] Failed to read assets CSS '${f}': ${e}`); }
    }
    for (const f of jsFiles) {
      try { assets_js.push({ filename: f, content: await readTextFile(path.join(assetsDir, f)) }); }
      catch (e) { console.warn(`[WARN] Failed to read assets JS '${f}': ${e}`); }
    }
  }

  return {
    css,
    template,
    assets_css,
    assets_js,
    version,
    schema_version,
    metadata,
    toc_config,
  };
}
