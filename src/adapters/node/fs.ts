// ============================================================
// src/adapters/node/fs.ts — Node.js 檔案系統操作
// 所有 I/O 集中於此，core 層保持零 I/O
// ============================================================

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Config, I18nFile, TemplateData } from "../../core/types.js";
import { LOCALE_DIR_PATTERN } from "../../core/markdown.js";

/** highlight.js styles/ 目錄（從 npm 套件解析，不依賴 lib/ 目錄） */
function resolveHljsStylesDir(): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("highlight.js/package.json");
  return path.join(path.dirname(pkgJson), "styles");
}

/** 讀取 UTF-8 文字檔（自動去除 BOM） */
export async function readTextFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

/** 寫入 UTF-8 文字檔 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

/** 遞迴確保目錄存在 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** 確認目錄是否存在（同步） */
export function dirExists(dirPath: string): boolean {
  try {
    return fsSync.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** 確認檔案是否存在（同步） */
export function fileExists(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** 確認是否是 Markdown 檔案 */
export function isMdFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

/** 副檔名 → MIME type 對應表 */
const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
};

/** 從遠端 URL fetch 圖片，回傳 buffer + mime */
async function fetchRemoteImage(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; mdsone-image-embedder/1.0)",
        "Accept": "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      console.warn(`[WARN] Remote image HTTP ${res.status}: ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const mime = contentType.split(";")[0].trim();
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    const resolvedMime = mime.startsWith("image/") ? mime : (MIME_MAP[ext] ?? "");
    if (!resolvedMime) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: resolvedMime };
  } catch (e) {
    console.warn(`[WARN] Failed to fetch remote image (${e instanceof Error ? e.message : e}): ${url}`);
    return null;
  }
}

/**
 * 選用 sharp 做 resize / compress。
 * sharp 未安裝時原樣回傳（保持擴展性，未來可加入儲存本地等功能）。
 */
async function processImageBuffer(
  buffer: Buffer,
  mime: string,
  opts: { maxWidth?: number; compress?: number },
): Promise<{ buffer: Buffer; mime: string }> {
  if ((!opts.maxWidth && !opts.compress) || mime === "image/svg+xml") return { buffer, mime };
  try {
    const sharp = (await import("sharp")).default;
    let pipe = sharp(buffer);
    if (opts.maxWidth) pipe = pipe.resize({ width: opts.maxWidth, withoutEnlargement: true });
    if (opts.compress) {
      const q = opts.compress;
      if (mime === "image/jpeg") pipe = pipe.jpeg({ quality: q });
      else if (mime === "image/webp") pipe = pipe.webp({ quality: q });
      else if (mime === "image/png") pipe = pipe.png({ quality: q });
    }
    const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: info.format ? `image/${info.format}` : mime };
  } catch {
    // sharp 未安裝或處理失敗，原樣回傳
    return { buffer, mime };
  }
}

/**
 * 將 HTML 中的圖片 src 轉換為 base64 data URL。
 * - 本地路徑（相對 / 絕對）：讀取檔案
 * - 遠端 URL（http / https）：fetch 後轉 base64
 * - 已是 data: URL：跳過
 */
export async function embedImagesInHtml(
  html: string,
  baseDir: string,
  opts: { maxWidth?: number; compress?: number } = {},
): Promise<string> {
  const imgPattern = /<img([^>]*)\ssrc=(['"])([^'"]+)\2([^>]*)>/gi;
  const replacements: Array<{ original: string; replaced: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = imgPattern.exec(html)) !== null) {
    const [full, before, , src, after] = match;
    if (/^data:/i.test(src)) continue;

    let imageData: { buffer: Buffer; mime: string } | null = null;

    if (/^https?:/i.test(src)) {
      // 遠端圖片
      imageData = await fetchRemoteImage(src);
      if (!imageData) {
        console.warn(`[WARN] Failed to fetch remote image: ${src}`);
        continue;
      }
    } else {
      // 本地圖片
      const absPath = path.isAbsolute(src) ? src : path.resolve(baseDir, src);
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME_MAP[ext];
      if (!mime) continue;
      try {
        const buffer = await fs.readFile(absPath);
        imageData = { buffer, mime };
      } catch {
        console.warn(`[WARN] Failed to read local image: ${absPath}`);
        continue;
      }
    }

    const processed = await processImageBuffer(imageData.buffer, imageData.mime, opts);
    const dataUrl = `data:${processed.mime};base64,${processed.buffer.toString("base64")}`;
    replacements.push({ original: full, replaced: `<img${before} src="${dataUrl}"${after}>` });
  }

  let result = html;
  for (const { original, replaced } of replacements) {
    result = result.replace(original, replaced);
  }
  return result;
}

/**
 * 找出目錄中所有 .md 檔案，依名稱排序。
 * 回傳 [{filename, filepath}, ...]
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
    .filter((e) => e.toLowerCase().endsWith(".md"))
    .sort()
    .map((e) => ({ filename: e, filepath: path.join(dir, e) }));
}

/**
 * 掃描 [locale] 子目錄，回傳 { locale_code: absolute_path }。
 * 對應 Python get_locale_dirs()。
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
 * 找出所有可用 template 名稱（目錄內需同時有 style.css + template.html）。
 * 對應 Python get_available_templates()。
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
 * 載入單一 locale JSON 檔案，找不到時 fallback 至 en.json。
 * 對應 Python I18n.load()。
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
 * 載入模板專屬的 locale 檔案（僅含 template 區塊）。
 * 找不到時回傳 null，呼叫端可決定 fallback 策略。
 * 查找順序：<locale>.json → en.json → null。
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
 * 載入指定 template 的所有檔案，回傳 TemplateData（含 inline 資源內容）。
 * 對應 Python load_template()。
 */
export async function loadTemplateFiles(
  templatesDir: string,
  templateName: string,
  templateConfigFile: string,
): Promise<TemplateData> {
  const templateDir = path.join(templatesDir, templateName);

  const css = await readTextFile(path.join(templateDir, "style.css"));
  const template = await readTextFile(path.join(templateDir, "template.html"));

  // 預設值
  let metadata = {};
  let version = "1.0.0";
  let schema_version = "v1";
  let toc_config = { enabled: false, levels: [2, 3] };

  const configPath = path.join(templateDir, templateConfigFile);
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

  // 掃描 assets/ 資料夾，自動收集 CSS / JS 檔案並依數字前綴排序後 inline 注入
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

// ── lib/ 資料夾讀取 ──────────────────────────────────────

/**
 * 根據 config 的 code_highlight / code_copy 旗標，
 * 從 libDir 讀取對應檔案並組裝為可直接插入 HTML 的字串。
 *
 * @returns { css, js } — css 插入 {LIB_CSS}，js 插入 {LIB_JS}
 */
export async function loadLibFiles(
  libDir: string,
  config: Config,
): Promise<{ css: string; js: string }> {
  const tryRead = async (filePath: string, label: string): Promise<string | null> => {
    try {
      return await readTextFile(filePath);
    } catch {
      console.warn(`[WARN] lib file not found, skipping: ${label}`);
      return null;
    }
  };

  const cssParts: string[] = [];
  const jsParts: string[] = [];

  // ── syntax highlight ─────────────────────────────────
  if (config.code_highlight) {
    const stylesDir = resolveHljsStylesDir();

    // CSS themes（從 npm highlight.js 套件讀取，高亮已在 build 時完成）
    const theme      = config.code_highlight_theme       || "atom-one-dark";
    const themeLight = config.code_highlight_theme_light || "atom-one-light";
    const darkFile  = `${theme}.min.css`;
    const lightFile = `${themeLight}.min.css`;

    const darkCss  = await tryRead(path.join(stylesDir, darkFile),  darkFile);
    const lightCss = await tryRead(path.join(stylesDir, lightFile), lightFile);

    // Inject dual-theme <style> tags (一個啟用、一個 disabled)
    if (darkCss) cssParts.push(`<style id="hljs-theme-dark">${darkCss}</style>`);
    if (lightCss) cssParts.push(`<style id="hljs-theme-light" disabled>${lightCss}</style>`);

    // 注入主題切換 helper（不再需要 highlight.js runtime，高亮已靜態完成）
    jsParts.push(
      `<script>\n` +
      `try {\n` +
      `window.__mdsone_hljs_theme = function(isDark) {\n` +
      `  var dark  = document.getElementById('hljs-theme-dark');\n` +
      `  var light = document.getElementById('hljs-theme-light');\n` +
      `  if (dark)  dark.disabled  = !isDark;\n` +
      `  if (light) light.disabled =  isDark;\n` +
      `};\n` +
      `} catch(e) {\n` +
      `  console.warn('[mdsone] hljs theme switch failed:', e.message);\n` +
      `  window.__mdsone_hljs_theme = function() {};\n` +
      `}\n` +
      `</script>`
    );
  }

  // ── copy button ──────────────────────────────────────
  if (config.code_copy) {
    const copyJs = await tryRead(path.join(libDir, "copy", "copy.js"), "copy/copy.js");
    if (copyJs) {
      jsParts.push(
        `<script>\n` +
        `try {\n` +
        copyJs + `\n` +
        `} catch(e) {\n` +
        `  console.warn('[mdsone] Failed to load copy button:', e.message);\n` +
        `}\n` +
        `</script>`,
      );
    }
  }

  return {
    css: cssParts.join("\n"),
    js: jsParts.join("\n"),
  };
}
