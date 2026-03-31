// ============================================================
// src/plugins/asset-registry.ts
// Generated plugin asset lookup for css/js file-based injection.
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { GENERATED_PLUGIN_ASSETS } from "./generated/plugin-assets.js";

export type PluginAssetKind = "css" | "js";

function normalizeAssetPath(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\.\//, "");
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

function listFilesRecursive(absDir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(absPath));
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(absPath);
  }
  return out;
}

function resolveFileSystemAsset(
  rawPath: string,
): { assetPath: string; content: string } | null {
  const candidates: string[] = [];
  if (path.isAbsolute(rawPath)) {
    candidates.push(rawPath);
  } else {
    candidates.push(path.resolve(process.cwd(), rawPath));
  }

  for (const absPath of candidates) {
    try {
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) continue;
      const content = stripBom(fs.readFileSync(absPath, "utf8"));
      return {
        assetPath: normalizeAssetPath(rawPath),
        content,
      };
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function resolvePluginLocalAsset(
  pluginName: string,
  assetPath: string,
): { assetPath: string; content: string } | null {
  const normalizedPath = normalizeAssetPath(assetPath);
  const absPath = path.resolve(process.cwd(), "plugins", pluginName, "assets", normalizedPath);
  try {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;
    const content = stripBom(fs.readFileSync(absPath, "utf8"));
    return { assetPath: normalizedPath, content };
  } catch {
    return null;
  }
}

export function resolveGeneratedPluginAsset(
  pluginName: string,
  kind: PluginAssetKind,
  assetPath: string,
): { assetPath: string; content: string } | null {
  const normalizedPath = normalizeAssetPath(assetPath);
  const bucket = GENERATED_PLUGIN_ASSETS[pluginName];
  if (!bucket) return null;

  const source = kind === "css" ? bucket.css : bucket.js;
  const content = source[normalizedPath];
  if (typeof content !== "string") return null;

  return { assetPath: normalizedPath, content };
}

function listGeneratedPluginAssets(
  pluginName: string,
  kind: PluginAssetKind,
): string[] {
  const bucket = GENERATED_PLUGIN_ASSETS[pluginName];
  if (!bucket) return [];
  const source = kind === "css" ? bucket.css : bucket.js;
  return Object.keys(source).sort((a, b) => a.localeCompare(b));
}

function listFileSystemPluginAssets(
  pluginName: string,
  kind: PluginAssetKind,
): string[] {
  const assetsRoot = path.resolve(process.cwd(), "plugins", pluginName, "assets");
  if (!fs.existsSync(assetsRoot) || !fs.statSync(assetsRoot).isDirectory()) return [];

  const ext = kind === "css" ? ".css" : ".js";
  return listFilesRecursive(assetsRoot)
    .filter((absPath) => path.extname(absPath).toLowerCase() === ext)
    .map((absPath) => normalizeAssetPath(path.relative(assetsRoot, absPath)))
    .sort((a, b) => a.localeCompare(b));
}

export function listPluginAssets(
  pluginName: string,
  kind: PluginAssetKind,
): string[] {
  const set = new Set<string>();
  for (const assetPath of listGeneratedPluginAssets(pluginName, kind)) {
    set.add(assetPath);
  }
  for (const assetPath of listFileSystemPluginAssets(pluginName, kind)) {
    set.add(assetPath);
  }
  return [...set];
}

export function resolvePluginAsset(
  pluginName: string,
  kind: PluginAssetKind,
  assetPath: string,
): { assetPath: string; content: string } | null {
  return (
    // Prefer local plugin assets in dev so plugin CSS/JS edits take effect immediately.
    resolvePluginLocalAsset(pluginName, assetPath)
    ?? resolveFileSystemAsset(assetPath)
    ?? resolveGeneratedPluginAsset(pluginName, kind, assetPath)
  );
}
