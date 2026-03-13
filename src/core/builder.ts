// ============================================================
// src/core/builder.ts — HTML 組裝、minify 與 mdsone_DATA 產生
// 對應 Python src/html_builder.py
// 核心層：零 I/O 依賴
// ============================================================

import type {
  BuildParams,
  Config,
  DocItem,
  mdsoneData,
  mdsoneDataMulti,
  mdsoneDataSingle,
  TocConfig,
} from "./types.js";
import { assembleTemplate, buildExtraTags } from "./template.js";

// ── Minify ────────────────────────────────────────────────

/**
 * 最小化 HTML，保留 <script> / <style> 內容不壓縮（對應 Python minify_html()）。
 * 步驟：儲存 script/style → 移除 HTML 注解 → 折疊空白 → 還原
 */
export function minifyHtml(html: string): string {
  const scripts: string[] = [];
  const styles: string[] = [];

  let result = html.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
    scripts.push(match);
    return `__SCRIPT_PLACEHOLDER_${scripts.length - 1}__`;
  });

  result = result.replace(/<style[\s\S]*?<\/style>/gi, (match) => {
    styles.push(match);
    return `__STYLE_PLACEHOLDER_${styles.length - 1}__`;
  });

  result = result.replace(/<!--[\s\S]*?-->/g, "");   // 移除 HTML 注解
  result = result.replace(/>\s+</g, "><");            // 折疊標籤間空白

  scripts.forEach((s, i) => { result = result.replace(`__SCRIPT_PLACEHOLDER_${i}__`, () => s); });
  styles.forEach((s, i) => { result = result.replace(`__STYLE_PLACEHOLDER_${i}__`, () => s); });

  return result;
}

// ── DocItem 組裝 ──────────────────────────────────────────

function buildDocItems(docs: Record<string, string>): DocItem[] {
  return Object.entries(docs).map(([tabName, html]) => {
    const short = tabName.length > 20 ? tabName.slice(0, 20) + "…" : tabName;
    return { id: tabName, title: short, name: tabName, html };
  });
}

// ── Config payload ────────────────────────────────────────

function buildConfigPayload(config: Config, buildDate: string, toc: TocConfig): mdsoneData["config"] {
  return {
    site_title: config.site_title,
    theme_mode: config.theme_mode,
    build_date: buildDate,
    toc,
  };
}

// ── 產生 BUILD_DATE ───────────────────────────────────────

function resolveBuildDate(config: Config): string {
  if (config.build_date) return config.build_date;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

// ── mdsone_DATA script 產生 ────────────────────────────────

/**
 * 產生 `<script>window.mdsone_DATA = {...};</script>`（對應 Python generate_data_script()）。
 * 單語模式:  buildParams.documents + buildParams.i18nStrings
 * 多語模式:  buildParams.multiDocuments + buildParams.multiI18nStrings
 */
export function generateDataScript(params: BuildParams): string {
  const { config, templateData } = params;
  const buildDate = resolveBuildDate(config);
  const toc = templateData.toc_config;
  const configPayload = buildConfigPayload(config, buildDate, toc);

  let data: mdsoneData;

  if (config.i18n_mode && params.multiDocuments && params.multiI18nStrings) {
    // ── 多語模式 ──
    const locales = Object.keys(params.multiDocuments);
    let defaultLocale = config.default_locale || config.locale || locales[0] || "en";
    if (defaultLocale && !locales.includes(defaultLocale) && locales.length > 0) {
      defaultLocale = locales[0];
    }

    const allDocs: Record<string, DocItem[]> = {};
    for (const [locale, localeDocs] of Object.entries(params.multiDocuments)) {
      allDocs[locale] = buildDocItems(localeDocs);
    }

    data = {
      locales,
      defaultLocale,
      docs: allDocs,
      config: configPayload,
      i18n: params.multiI18nStrings,
    } satisfies mdsoneDataMulti;
  } else {
    // ── 單語模式 ──
    const docs = buildDocItems(params.documents ?? {});
    const i18nStrings = params.i18nStrings ?? {};
    data = {
      docs,
      config: configPayload,
      i18n: i18nStrings,
    } satisfies mdsoneDataSingle;
  }

  const json = JSON.stringify(data, null, 0);
  return `<script>window.mdsone_DATA = ${json};</script>`;
}

// ── 主組裝 ────────────────────────────────────────────────

/**
 * 主入口：組裝完整 HTML（對應 Python generate_html()）。
 * 傳入 BuildParams（已包含轉換好的 documents + i18n 字串），
 * 此函式只負責組裝 + 選擇性 minify，不做任何 I/O。
 */
export function buildHtml(params: BuildParams): string {
  const { config, templateData } = params;

  // 決定 html lang 屬性
  let htmlLang = "en";
  if (config.i18n_mode && params.multiI18nStrings) {
    const locales = Object.keys(params.multiDocuments ?? {});
    const defLocale = config.default_locale || config.locale || locales[0] || "en";
    const localeKey = locales.includes(defLocale) ? defLocale : locales[0] ?? "en";
    htmlLang = params.multiI18nStrings[localeKey]?.["html_lang"] ?? "en";
  } else if (params.i18nStrings) {
    htmlLang = params.i18nStrings["html_lang"] ?? "en";
  }

  const dataScript = generateDataScript(params);
  const { cssTagsHtml, jsTagsHtml } = buildExtraTags(templateData);

  const replacements: Record<string, string> = {
    TITLE: config.site_title,
    LANG: htmlLang,
    CSS_CONTENT: templateData.css,
    LIB_CSS: params.libCss ?? "",
    LIB_JS: params.libJs ?? "",
    EXTRA_CSS: cssTagsHtml,
    EXTRA_JS: jsTagsHtml,
    MDSONE_DATA_SCRIPT: dataScript,
  };

  let html = assembleTemplate(templateData.template, replacements);

  if (config.minify_html) {
    html = minifyHtml(html);
  }

  return html;
}
