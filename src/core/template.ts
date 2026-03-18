// ============================================================
// src/core/template.ts — 模板組裝純函數層
// 對應 Python src/template_loader.py（組裝部分，不含 I/O）
// 核心層：零 I/O 依賴
// ============================================================

import type { TemplateData } from "./types.js";

/**
 * 產生 assets/ CSS 的 inline <style> 標籤。
 * 每個檔案輸出為獨立的 <style>/* filename *\/\n...\n</style> 區塊。
 */
export function generateExtraCssTags(
  assets: Array<{ filename: string; content: string }>,
): string {
  return assets
    .map(({ filename, content }) => `    <style>/* ${filename} */\n${content}\n    </style>`)
    .join("\n");
}

/**
 * 產生 assets/ JS 的 inline <script> 標籤。
 * 每個檔案輸出為獨立的 <script>/* filename *\/\n...\n</script> 區塊。
 */
export function generateExtraJsTags(
  assets: Array<{ filename: string; content: string }>,
): string {
  return assets
    .map(({ filename, content }) => `    <script>/* ${filename} */\n${content}\n    </script>`)
    .join("\n");
}

/**
 * 將 template HTML 中的 `{PLACEHOLDER}` 替換為指定值（對應 Python html_output.replace(...)）。
 * 僅替換已知 replacements key，不做全域 token 清除。
 * 這可避免誤傷文件內容中的 `{TITLE}` 之類字串。
 */
export function assembleTemplate(
  template: string,
  replacements: Record<string, string>,
): string {
  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`{${key}}`).join(value);
  }
  return html;
}

/**
 * 從已載入的 TemplateData 提取 assets/ 資源內容，
 * 回傳組裝好的 <style>/<script> inline 標籤字串。
 */
export function buildExtraTags(templateData: TemplateData): {
  cssTagsHtml: string;
  jsTagsHtml: string;
} {
  return {
    cssTagsHtml: generateExtraCssTags(templateData.assets_css),
    jsTagsHtml:  generateExtraJsTags(templateData.assets_js),
  };
}
