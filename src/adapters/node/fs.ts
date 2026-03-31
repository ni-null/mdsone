// ============================================================
// src/adapters/node/fs.ts
// Node filesystem adapter used by CLI/runtime orchestration.
// ============================================================

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { I18nFile, TemplateData } from "../../core/types.js";
import { LOCALE_DIR_PATTERN } from "../../core/markdown.js";

type PlainObject = Record<string, unknown>;

function asObject(value: unknown): PlainObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PlainObject)
    : {};
}

function parseShikiSettings(raw: unknown): { dark?: string; light?: string; auto_detect?: boolean } | undefined {
  const obj = asObject(raw);
  const dark = typeof obj["dark"] === "string" ? obj["dark"] : undefined;
  const light = typeof obj["light"] === "string" ? obj["light"] : undefined;
  const autoDetect = typeof obj["auto_detect"] === "boolean" ? obj["auto_detect"] : undefined;
  if (!dark && !light && autoDetect === undefined) return undefined;
  return { dark, light, auto_detect: autoDetect };
}

function parseMermaidSettings(raw: unknown): { dark?: string; light?: string } | undefined {
  const obj = asObject(raw);
  const dark = typeof obj["dark"] === "string" ? obj["dark"] : undefined;
  const light = typeof obj["light"] === "string" ? obj["light"] : undefined;
  if (!dark && !light) return undefined;
  return { dark, light };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeSvgInner(content: string): string {
  let result = content;
  result = result.replace(/<script[\s\S]*?<\/script>/gi, "");
  result = result.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  result = result.replace(/\s(?:xlink:href|href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "");
  return result;
}

function toIconId(filename: string): string {
  const base = filename.replace(/\.svg$/i, "").trim().toLowerCase();
  const slug = base.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `icon-${slug || "asset"}`;
}

function parseSvgSymbol(filename: string, rawSvg: string): { id: string; symbol: string } | null {
  const match = rawSvg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) return null;
  const attrs = match[1] ?? "";
  const innerRaw = match[2] ?? "";
  const viewBoxMatch = attrs.match(/viewBox\s*=\s*("([^"]*)"|'([^']*)')/i);
  const viewBox = (viewBoxMatch?.[2] ?? viewBoxMatch?.[3] ?? "").trim();
  if (!viewBox) {
    console.warn(`[WARN] SVG asset '${filename}' has no viewBox. Skipped.`);
    return null;
  }
  const cleanedInner = sanitizeSvgInner(innerRaw).trim();
  if (!cleanedInner) return null;
  const id = toIconId(filename);
  const safeViewBox = escapeHtmlAttr(viewBox);
  const symbol = `<symbol id="${id}" viewBox="${safeViewBox}">\n${cleanedInner}\n</symbol>`;
  return { id, symbol };
}

async function buildSvgSprite(assetsSvgDir: string): Promise<string> {
  if (!fsSync.existsSync(assetsSvgDir) || !fsSync.statSync(assetsSvgDir).isDirectory()) {
    return "";
  }
  const svgFiles = fsSync.readdirSync(assetsSvgDir)
    .filter((f) => f.toLowerCase().endsWith(".svg"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  if (svgFiles.length === 0) return "";

  const symbols: string[] = [];
  const seenIds = new Set<string>();

  for (const filename of svgFiles) {
    const fullPath = path.join(assetsSvgDir, filename);
    try {
      const raw = await readTextFile(fullPath);
      const parsed = parseSvgSymbol(filename, raw);
      if (!parsed) {
        console.warn(`[WARN] Failed to parse SVG asset '${filename}'.`);
        continue;
      }
      if (seenIds.has(parsed.id)) {
        console.warn(`[WARN] Duplicate SVG icon id '${parsed.id}' from '${filename}'. Skipped.`);
        continue;
      }
      seenIds.add(parsed.id);
      symbols.push(parsed.symbol);
    } catch (e) {
      console.warn(`[WARN] Failed to read SVG asset '${filename}': ${e}`);
    }
  }

  if (symbols.length === 0) return "";
  return [
    '<svg id="mdsone-svg-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">',
    ...symbols,
    "</svg>",
  ].join("\n");
}

/** Read UTF-8 text and strip BOM if present. */
export async function readTextFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8");
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

/** Write UTF-8 text. */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}

/** Ensure directory exists (recursive). */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e
      ? String((e as { code?: unknown }).code ?? "")
      : "";
    if (code === "EEXIST" && dirExists(dirPath)) {
      return;
    }
    throw e;
  }
}

/** Return true if path exists and is a directory. */
export function dirExists(dirPath: string): boolean {
  try {
    return fsSync.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** Return true if path exists and is a file. */
export function fileExists(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Return true for .md or .markdown files. */
export function isMdFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

/** List markdown files in one directory, sorted by filename. */
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

/** Scan [locale] subdirectories and return { locale: absolute_path }. */
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

/** Scan template directories containing template.html and assets/style.css. */
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
    const hasCss = fsSync.existsSync(path.join(dir, "assets", "style.css"));
    const hasHtml = fsSync.existsSync(path.join(dir, "template.html"));
    if (hasCss && hasHtml) names.push(entry.name);
  }
  return names.sort();
}

/** Load locale JSON file with fallback to en.json. */
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
 * Load global locale display-name mapping from locales/config.json.
 * If file is missing or invalid, return an empty map.
 */
export async function loadLocaleNamesConfig(
  localesDir: string,
): Promise<Record<string, string>> {
  const filePath = path.join(localesDir, "config.json");
  if (!fsSync.existsSync(filePath)) return {};

  try {
    const raw = JSON.parse(await readTextFile(filePath)) as Record<string, unknown>;
    const namesRaw = Object.keys(asObject(raw["locale_names"])).length > 0
      ? asObject(raw["locale_names"])
      : asObject(raw);
    const names: Record<string, string> = {};
    for (const [k, v] of Object.entries(namesRaw)) {
      if (!k.startsWith("_") && typeof v === "string" && v.trim()) {
        names[k] = v.trim();
      }
    }
    return names;
  } catch (e) {
    console.warn(`[WARN] Failed to load locale names config: ${e}`);
    return {};
  }
}

/**
 * Load template-localized strings from templates/<name>/locales/<locale>.json.
 * Fallback order: locale file -> en.json -> null.
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

/** Load template files and normalized config payload. */
export async function loadTemplateFiles(
  templatesDir: string,
  templateName: string,
): Promise<TemplateData> {
  const templateDir = path.join(templatesDir, templateName);

  const assetsDir = path.join(templateDir, "assets");
  const assetsPrimaryCssPath = path.join(assetsDir, "style.css");
  if (!fsSync.existsSync(assetsPrimaryCssPath)) {
    throw new Error(
      `Template '${templateName}' missing CSS. Expected '${assetsPrimaryCssPath}'.`,
    );
  }
  const template = await readTextFile(path.join(templateDir, "template.html"));

  // Defaults
  let metadata = {};
  let version = "1.0.0";
  let schema_version = "v1";
  let template_config: TemplateData["config"] = {};

  const configPath = path.join(templateDir, "template.config.json");
  if (fsSync.existsSync(configPath)) {
    try {
      const raw = JSON.parse(await readTextFile(configPath)) as Record<string, unknown>;
      metadata = (raw["_metadata"] ?? {}) as object;
      version = (metadata as Record<string, string>)["version"] ?? "1.0.0";
      schema_version = (metadata as Record<string, string>)["schema_version"] ?? "v1";
      const cfgRaw = asObject(raw["config"]);
      const rootPalette = typeof cfgRaw["palette"] === "string" ? cfgRaw["palette"] : undefined;
      if (rootPalette) {
        template_config = { ...template_config, palette: rootPalette };
      }
      const rootCode = asObject(cfgRaw["code"]);
      const rootShiki = parseShikiSettings(rootCode["Shiki"] ?? rootCode["shiki"]);
      const rootMermaid = parseMermaidSettings(rootCode["mermaid"] ?? rootCode["Mermaid"]);
      if (rootShiki || rootMermaid) {
        template_config = {
          ...template_config,
          code: {
            ...(template_config.code ?? {}),
            ...(rootShiki ? { Shiki: rootShiki } : {}),
            ...(rootMermaid ? { mermaid: rootMermaid } : {}),
          },
        };
      }

      const parsedTypes: NonNullable<TemplateData["config"]["types"]> = {};
      const typesRaw = asObject(cfgRaw["types"]);
      for (const [typeName, typeValue] of Object.entries(typesRaw)) {
        const typeObj = asObject(typeValue);
        const typeCode = asObject(typeObj["code"]);
        const typeShiki = parseShikiSettings(typeCode["Shiki"] ?? typeCode["shiki"]);
        const typeMermaid = parseMermaidSettings(typeCode["mermaid"] ?? typeCode["Mermaid"]);
        const typePalette = typeof typeObj["palette"] === "string" ? typeObj["palette"] : undefined;
        if (typeShiki || typeMermaid || typePalette) {
          parsedTypes[typeName] = {
            ...(typePalette ? { palette: typePalette } : {}),
            ...((typeShiki || typeMermaid)
              ? {
                  code: {
                    ...(typeShiki ? { Shiki: typeShiki } : {}),
                    ...(typeMermaid ? { mermaid: typeMermaid } : {}),
                  },
                }
              : {}),
          };
        }
      }

      if (Object.keys(parsedTypes).length > 0) {
        template_config = { ...template_config, types: parsedTypes };
      }
    } catch (e) {
      console.warn(`[WARN] Failed to load template config: ${e}`);
    }
  }

  // Load and sort assets files from template assets/
  const assetsSvgDir = path.join(assetsDir, "svg");
  const assets_css: Array<{ filename: string; content: string }> = [];
  const assets_js: Array<{ filename: string; content: string }> = [];
  let assets_svg_sprite = "";

  if (fsSync.existsSync(assetsDir)) {
    assets_svg_sprite = await buildSvgSprite(assetsSvgDir);
    const entries = fsSync.readdirSync(assetsDir);
    const cssFiles = entries.filter(f => f.endsWith(".css")).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
    const jsFiles = entries.filter(f => f.endsWith(".js")).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );

    for (const f of cssFiles) {
      try {
        assets_css.push({ filename: f, content: await readTextFile(path.join(assetsDir, f)) });
      } catch (e) {
        console.warn(`[WARN] Failed to read assets CSS '${f}': ${e}`);
      }
    }
    for (const f of jsFiles) {
      try {
        assets_js.push({ filename: f, content: await readTextFile(path.join(assetsDir, f)) });
      } catch (e) {
        console.warn(`[WARN] Failed to read assets JS '${f}': ${e}`);
      }
    }
  }

  return {
    template,
    assets_svg_sprite,
    assets_css,
    assets_js,
    version,
    schema_version,
    metadata,
    config: template_config,
  };
}
