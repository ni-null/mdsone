// ============================================================
// src/adapters/node/config_loader.ts — 設定載入與合併
// 負責讀取 config.toml、.env，並將 env var 對映至 Partial<Config>
// 對應 Python src/config.py（I/O 部分）
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import type { Config, ValidationResult } from "../../core/types.js";
import { DEFAULT_CONFIG, mergeConfigs } from "../../core/config.js";
import { dirExists } from "./fs.js";

// ── TOML 解析 ─────────────────────────────────────────────

/** 動態 import @iarna/toml（純 ESM 套件） */
async function parseTOML(raw: string): Promise<Record<string, unknown>> {
  const toml = await import("@iarna/toml");
  return toml.parse(raw) as Record<string, unknown>;
}

// ── env var → bool 轉換 ───────────────────────────────────

function parseBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined || val === null) return fallback;
  return ["true", "1", "yes", "on"].includes(val.toLowerCase());
}

function parseList(val: string | undefined, fallback: string[]): string[] {
  if (!val) return fallback;
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

// ── 從環境變數提取 Partial<Config>（對應 Python _s/_b/_l 系列）──

export function envToConfig(): Partial<Config> {
  const e = process.env;
  const out: Partial<Config> = {};

  if (e["MARKDOWN_SOURCE_DIR"]) out.markdown_source_dir = e["MARKDOWN_SOURCE_DIR"];
  if (e["OUTPUT_FILE"]) out.output_file = e["OUTPUT_FILE"];
  if (e["OUTPUT_DIR"]) out.output_dir = e["OUTPUT_DIR"];
  if (e["OUTPUT_FILENAME"]) out.output_filename = e["OUTPUT_FILENAME"];
  if (e["TEMPLATES_DIR"]) out.templates_dir = e["TEMPLATES_DIR"];
  if (e["LOCALES_DIR"]) out.locales_dir = e["LOCALES_DIR"];
  if (e["DEFAULT_TEMPLATE"]) out.default_template = e["DEFAULT_TEMPLATE"];
  if (e["TEMPLATE_CONFIG_FILE"]) out.template_config_file = e["TEMPLATE_CONFIG_FILE"];
  if (e["BUILD_DATE"]) out.build_date = e["BUILD_DATE"];
  if (e["SITE_TITLE"]) out.site_title = e["SITE_TITLE"];
  if (e["THEME_MODE"]) out.theme_mode = e["THEME_MODE"] as Config["theme_mode"];
  if (e["LOCALE"]) out.locale = e["LOCALE"];
  if (e["DEFAULT_LOCALE"]) out.default_locale = e["DEFAULT_LOCALE"];
  if (e["MINIFY_HTML"] !== undefined) out.minify_html = parseBool(e["MINIFY_HTML"], true);
  if (e["I18N_MODE"] !== undefined) out.i18n_mode = parseBool(e["I18N_MODE"], false);
  if (e["IMG_TO_BASE64"] !== undefined) out.img_to_base64 = parseBool(e["IMG_TO_BASE64"], false);
  if (e["IMG_MAX_WIDTH"] !== undefined) { const w = parseInt(e["IMG_MAX_WIDTH"]!, 10); if (!isNaN(w) && w > 0) out.img_max_width = w; }
  if (e["IMG_COMPRESS"] !== undefined) { const q = parseInt(e["IMG_COMPRESS"]!, 10); if (!isNaN(q)) out.img_compress = Math.max(1, Math.min(100, q)); }
  if (e["CODE_HIGHLIGHT"] !== undefined) out.code_highlight = !["disable", "false", "0", "off"].includes(e["CODE_HIGHLIGHT"]!.toLowerCase());
  if (e["CODE_COPY"] !== undefined) out.code_copy = !["disable", "false", "0", "off"].includes(e["CODE_COPY"]!.toLowerCase());
  if (e["CODE_HIGHLIGHT_THEME"]) out.code_highlight_theme = e["CODE_HIGHLIGHT_THEME"];
  if (e["CODE_HIGHLIGHT_THEME_LIGHT"]) out.code_highlight_theme_light = e["CODE_HIGHLIGHT_THEME_LIGHT"];
  if (e["MARKDOWN_EXTENSIONS"]) {
    out.markdown_extensions = parseList(e["MARKDOWN_EXTENSIONS"], DEFAULT_CONFIG.markdown_extensions);
  }
  return out;
}

// ── 從 TOML 段落提取 Partial<Config>（對應 Python _raw.get(...)）──

function tomlToConfig(raw: Record<string, unknown>): Partial<Config> {
  const paths = (raw["paths"] ?? {}) as Record<string, unknown>;
  const build = (raw["build"] ?? {}) as Record<string, unknown>;
  const site = (raw["site"] ?? {}) as Record<string, unknown>;
  const i18n = (raw["i18n"] ?? {}) as Record<string, unknown>;

  const out: Partial<Config> = {};

  const s = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const b = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  const l = (v: unknown): string[] | undefined => (Array.isArray(v) ? (v as string[]) : undefined);

  if (s(paths["markdown_source_dir"])) out.markdown_source_dir = s(paths["markdown_source_dir"]);
  if (s(paths["output_file"])) out.output_file = s(paths["output_file"]);
  if (s(paths["output_dir"])) out.output_dir = s(paths["output_dir"]);
  if (s(paths["output_filename"])) out.output_filename = s(paths["output_filename"]);
  if (s(paths["templates_dir"])) out.templates_dir = s(paths["templates_dir"]);
  if (s(paths["locales_dir"])) out.locales_dir = s(paths["locales_dir"]);

  if (s(build["default_template"])) out.default_template = s(build["default_template"]);
  if (b(build["minify_html"]) !== undefined) out.minify_html = b(build["minify_html"]);
  if (l(build["markdown_extensions"])) out.markdown_extensions = l(build["markdown_extensions"]);
  if (s(build["template_config_file"])) out.template_config_file = s(build["template_config_file"]);
  if (s(build["build_date"])) out.build_date = s(build["build_date"]);
  if (b(build["img_to_base64"]) !== undefined) out.img_to_base64 = b(build["img_to_base64"]);
  if (typeof build["img_max_width"] === "number" && (build["img_max_width"] as number) > 0) out.img_max_width = build["img_max_width"] as number;
  if (typeof build["img_compress"] === "number") out.img_compress = Math.max(1, Math.min(100, build["img_compress"] as number));
  if (b(build["code_highlight"]) !== undefined) out.code_highlight = b(build["code_highlight"])!;
  if (b(build["code_copy"]) !== undefined) out.code_copy = b(build["code_copy"])!;
  if (s(build["code_highlight_theme"])) out.code_highlight_theme = s(build["code_highlight_theme"]);
  if (s(build["code_highlight_theme_light"])) out.code_highlight_theme_light = s(build["code_highlight_theme_light"]);

  if (s(site["title"])) out.site_title = s(site["title"]);
  if (s(site["theme_mode"])) out.theme_mode = s(site["theme_mode"]) as Config["theme_mode"];

  if (s(i18n["locale"])) out.locale = s(i18n["locale"]);
  if (b(i18n["mode"]) !== undefined) out.i18n_mode = b(i18n["mode"]);
  if (s(i18n["default_locale"])) out.default_locale = s(i18n["default_locale"]);

  return out;
}

// ── 主要載入函式 ──────────────────────────────────────────

/**
 * 載入 .env 檔（若存在），注入至 process.env。
 * 對應 Python 版 DeploySingleFile 的 dotenv 邏輯。
 */
export function loadEnvFile(envPath?: string): void {
  const target = envPath ?? path.join(process.cwd(), ".env");
  if (fs.existsSync(target)) {
    dotenvConfig({ path: target });
  }
}

/**
 * 讀取 config.toml 並解析為 Partial<Config>。
 * 不存在時回傳空物件（CI 環境）。
 */
export async function loadConfigFile(configPath?: string): Promise<Partial<Config>> {
  const target = configPath ?? path.join(process.cwd(), "config.toml");
  if (!fs.existsSync(target)) return {};
  try {
    const raw = fs.readFileSync(target, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parsed = await parseTOML(raw);
    return tomlToConfig(parsed);
  } catch (e) {
    console.warn(`[WARN] Could not load config.toml: ${e}. Using defaults.`);
    return {};
  }
}

/**
 * 建立最終合併 Config（優先序：CLI > env > toml > default）。
 */
export function buildConfig(
  toml: Partial<Config>,
  cliOverride: Partial<Config>,
): Config {
  const env = envToConfig();
  return mergeConfigs(DEFAULT_CONFIG, toml, env, cliOverride);
}

/**
 * 驗證 markdown_source_dir 是否實際存在於 fs（Node.js 端驗證）。
 */
export function validateDirExists(config: Config): ValidationResult {
  const errors: string[] = [];
  if (!dirExists(config.markdown_source_dir)) {
    errors.push(`Markdown source directory not found: ${config.markdown_source_dir}`);
  }
  return { valid: errors.length === 0, errors };
}
