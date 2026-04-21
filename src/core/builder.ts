// ============================================================
// src/core/builder.ts — HTML 組裝與 mdsone_DATA 產生
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
} from "./types.js";
import { assembleTemplate, buildExtraTags } from "./template.js";
import { resolveBuildDate } from "./build-date.js";

/**
 * Escape JSON text for safe embedding inside HTML `<script>` raw-text context.
 * This prevents accidental `</script>` termination and preserves line separators.
 */
function escapeJsonForHtmlScript(json: string): string {
  return json
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildCoreLibCss(libCss?: string): string {
  const coreBaseCssTag = [
    "    <style>/* core/base.css */",
    ":where(.tab-content) :where(img),",
    ".mdsone-embedded-image {",
    "  max-width: 100%;",
    "  height: auto;",
    "}",
    "    </style>",
  ].join("\n");
  if (!libCss || !libCss.trim()) return coreBaseCssTag;
  return `${coreBaseCssTag}\n${libCss}`;
}

// ── DocItem 組裝 ──────────────────────────────────────────

function buildDocItems(docs: Record<string, string>): DocItem[] {
  return Object.entries(docs).map(([tabName, html]) => {
    const short = tabName.length > 20 ? tabName.slice(0, 20) + "…" : tabName;
    return { id: tabName, title: short, name: tabName, html };
  });
}

// ── Config payload ────────────────────────────────────────

function buildConfigPayload(
  config: Config,
  buildDate: string,
  templatePalette?: string,
  templateTypes?: Record<string, { palette?: string }>,
): mdsoneData["config"] {
  const templateVariant = config.template_variant || "default";
  const hasVariantType = !!templateTypes?.[templateVariant];
  const variantKeyPalette =
    templateVariant !== "default" && hasVariantType ? templateVariant : undefined;
  const typePalette =
    templateTypes?.[templateVariant]?.palette
    ?? variantKeyPalette
    ?? templateTypes?.default?.palette;
  const resolvedPalette = typePalette ?? templatePalette;

  return {
    site_title: config.site_title,
    theme_mode: config.theme_mode,
    build_date: buildDate,
    template_variant: templateVariant,
    ...(resolvedPalette ? { palette: resolvedPalette } : {}),
    ...(templateTypes ? { types: templateTypes } : {}),
  };
}

// ── mdsone_DATA script 產生 ────────────────────────────────

/**
 * 產生 `<script id="mdsone-data" type="application/json">...</script>`（對應 Python generate_data_script()）。
 * 單語模式:  buildParams.documents + buildParams.i18nStrings
 * 多語模式:  buildParams.multiDocuments + buildParams.multiI18nStrings
 */
export function generateDataScript(params: BuildParams): string {
  const { config, templateData } = params;
  const buildDate = resolveBuildDate(config);
  const paletteTypes = templateData.config.types
    ? Object.fromEntries(
        Object.entries(templateData.config.types).map(([name, v]) => [name, { palette: v.palette }]),
      )
    : undefined;
  const configPayload = buildConfigPayload(
    config,
    buildDate,
    templateData.config.palette,
    paletteTypes,
  );

  let data: mdsoneData;

  if (config.i18n_mode && params.multiDocuments && params.multiI18nStrings) {
    // ── 多語模式 ──
    const locales = Object.keys(params.multiDocuments);
    let defaultLocale = config.default_locale || locales[0] || "en";
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
      ...(params.localeNames ? { localeNames: params.localeNames } : {}),
    } satisfies mdsoneDataMulti;
  } else {
    // ── 單語模式 ──
    const docs = buildDocItems(params.documents ?? {});
    const i18nStrings = params.i18nStrings ?? {};
    data = {
      docs,
      config: configPayload,
      i18n: i18nStrings,
      ...(params.localeNames ? { localeNames: params.localeNames } : {}),
    } satisfies mdsoneDataSingle;
  }

  const json = JSON.stringify(data, null, 0);
  const escapedJson = escapeJsonForHtmlScript(json);
  return `<script id="mdsone-data" type="application/json">${escapedJson}</script>`;
}

// ── 主組裝 ────────────────────────────────────────────────

/**
 * 主入口：組裝完整 HTML（對應 Python generate_html()）。
 * 傳入 BuildParams（已包含轉換好的 documents + i18n 字串），
 * 此函式只負責組裝，不做任何 I/O。
 */
export function buildHtml(params: BuildParams): string {
  const { config, templateData } = params;

  // 決定 html lang 屬性
  let htmlLang = "en";
  if (config.i18n_mode && params.multiI18nStrings) {
    const locales = Object.keys(params.multiDocuments ?? {});
    const defLocale = config.default_locale || locales[0] || "en";
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
    SVG_SPRITE: templateData.assets_svg_sprite ?? "",
    LIB_CSS: buildCoreLibCss(params.libCss),
    LIB_JS: params.libJs ?? "",
    EXTRA_CSS: cssTagsHtml,
    EXTRA_JS: jsTagsHtml,
    MDSONE_DATA_SCRIPT: dataScript,
  };

  return assembleTemplate(templateData.template, replacements);
}
