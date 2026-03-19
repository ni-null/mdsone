// ============================================================
// src/adapters/node/config_loader.ts — 設定載入與合併
// 負責讀取 config.toml，並將 process.env 對映至 Partial<Config>
// 對應 Python src/config.py（I/O 部分）
// ============================================================

import fs from "node:fs";
import path from "node:path";
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
  const v = val.toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
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
  if (e["TEMPLATES_DIR"]) out.templates_dir = e["TEMPLATES_DIR"];
  if (e["DEFAULT_TEMPLATE"]) out.default_template = e["DEFAULT_TEMPLATE"];
  if (e["BUILD_DATE"]) out.build_date = e["BUILD_DATE"];
  if (e["SITE_TITLE"]) out.site_title = e["SITE_TITLE"];
  if (e["THEME_MODE"]) out.theme_mode = e["THEME_MODE"] as Config["theme_mode"];
  if (e["LOCALE"]) out.locale = e["LOCALE"];
  if (e["DEFAULT_LOCALE"]) out.default_locale = e["DEFAULT_LOCALE"];
  if (e["I18N_MODE"] !== undefined) out.i18n_mode = parseBool(e["I18N_MODE"], false);
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
  const plugins = (raw["plugins"] ?? {}) as Record<string, unknown>;

  const out: Partial<Config> = {};

  const s = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const b = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  const l = (v: unknown): string[] | undefined => (Array.isArray(v) ? (v as string[]) : undefined);

  // 支援 paths.source （新格式）和 paths.markdown_source_dir （舊格式）兩者均可，新格式優先
  if (s(paths["source"])) out.markdown_source_dir = s(paths["source"]);
  else if (s(paths["markdown_source_dir"])) out.markdown_source_dir = s(paths["markdown_source_dir"]);
  if (s(paths["output_file"])) out.output_file = s(paths["output_file"]);
  if (s(paths["templates_dir"])) out.templates_dir = s(paths["templates_dir"]);

  if (s(build["default_template"])) out.default_template = s(build["default_template"]);
  if (l(build["markdown_extensions"])) out.markdown_extensions = l(build["markdown_extensions"]);
  if (s(build["build_date"])) out.build_date = s(build["build_date"]);

  if (s(site["title"])) out.site_title = s(site["title"]);
  if (s(site["theme_mode"])) out.theme_mode = s(site["theme_mode"]) as Config["theme_mode"];

  if (s(i18n["locale"])) out.locale = s(i18n["locale"]);
  if (b(i18n["mode"]) !== undefined) out.i18n_mode = b(i18n["mode"]);
  if (s(i18n["default_locale"])) out.default_locale = s(i18n["default_locale"]);

  const order = (plugins["order"] ?? undefined) as unknown;
  if (Array.isArray(order)) {
    out.plugins = { ...(out.plugins ?? {}), order: order.filter((x) => typeof x === "string") as string[] };
  }
  const pluginConfigEntries = Object.entries(plugins).filter(
    ([k, v]) => k !== "order" && typeof v === "object" && v !== null && !Array.isArray(v),
  );
  if (pluginConfigEntries.length > 0) {
    const prevConfig = out.plugins?.config ?? {};
    out.plugins = {
      ...(out.plugins ?? {}),
      config: {
        ...prevConfig,
        ...Object.fromEntries(pluginConfigEntries as Array<[string, Record<string, unknown>]>),
      },
    };
  }
  return out;
}

// ── 主要載入函式 ──────────────────────────────────────────

/**
 * 讀取 config.toml 並解析為 Partial<Config>。
 * 不存在時回傳空物件（CI 環境）。
 */
export async function loadConfigFile(configPath?: string): Promise<Partial<Config>> {
  const target = configPath ?? path.join(process.cwd(), "config.toml");
  if (!fs.existsSync(target)) return {};
  try {
    let raw = fs.readFileSync(target, "utf-8");
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    raw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
