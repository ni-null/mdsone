// ============================================================
// src/core/markdown.ts — Markdown → HTML 純函數層
// 對應 Python src/markdown_proc.py
// 依賴：markdown-it（第三方）；零 Node.js I/O 依賴
// ============================================================

import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";
// @ts-ignore — markdown-it-attrs 沒有官方型別宣告
import markdownItAttrs from "markdown-it-attrs";
import hljs from "highlight.js";

/** `[locale]` 目錄名稱的正則（例如 [en]、[zh-TW]） */
export const LOCALE_DIR_PATTERN = /^\[(.+)\]$/;

// ── 工具函式 ──────────────────────────────────────────────

/**
 * 將標題文字轉換為 URL-friendly slug（對應 Python slugify()）。
 * 規則：小寫、移除 HTML 標籤、空白/底線→連字號、移除非 ASCII 英數、去重複連字號
 */
export function slugify(text: string): string {
  let slug = text.toLowerCase();
  slug = slug.replace(/<[^>]+>/g, "");          // 移除 HTML 標籤
  slug = slug.replace(/[\s_]+/g, "-");           // 空白/底線 → -
  slug = slug.replace(/[^a-z0-9\-]/g, "");      // 移除非英數字符
  slug = slug.replace(/-+/g, "-");               // 去重複連字號
  slug = slug.replace(/^-+|-+$/g, "");           // 去頭尾連字號
  return slug || "heading";
}

/**
 * 為 HTML 中的 h1–h6 標籤加入 id 屬性（對應 Python add_heading_ids()）。
 * 若已有 id 則跳過；重複 id 加 -2、-3 後綴。
 */
export function addHeadingIds(html: string): string {
  const seenIds: Record<string, number> = {};

  return html.replace(/<(h[1-6])>([^<]+)<\/\1>/g, (match, tag: string, text: string) => {
    if (match.includes("id=")) return match;
    const baseId = slugify(text);
    let finalId: string;
    if (seenIds[baseId]) {
      seenIds[baseId]++;
      finalId = `${baseId}-${seenIds[baseId]}`;
    } else {
      seenIds[baseId] = 1;
      finalId = baseId;
    }
    return `<${tag} id="${finalId}">${text}</${tag}>`;
  });
}

/**
 * code block 內的 `{` `}` 轉為 HTML entity，
 * 防止與 template 佔位符衝突（對應 Python escape_braces_in_code）。
 * 注意：regex 使用 `<code[^>]*>` 以匹配帶 class 的元素（server-side 高亮後才有 class）。
 */
export function escapeCodeBlocks(html: string): string {
  return html.replace(/<code([^>]*)>([\s\S]*?)<\/code>/g, (_match, attrs: string, inner: string) => {
    const escaped = inner.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
    return `<code${attrs}>${escaped}</code>`;
  });
}

/**
 * 移除 `<td>` 內的 `<script>` / `<link>` 標籤（escape 成 &lt;），
 * 防止 XSS（對應 Python escape_tags_in_cell）。
 */
export function sanitizeTableCells(html: string): string {
  return html.replace(/<td>([\s\S]*?)<\/td>/g, (_match, inner: string) => {
    let safe = inner.replace(/<(\/?script)/gi, "&lt;$1");
    safe = safe.replace(/<(\/?link)/gi, "&lt;$1");
    return `<td>${safe}</td>`;
  });
}

/**
 * 建立 markdown-it 實例。
 * extensions 清單與 Python markdown lib 的 extensions 名稱對應：
 *   tables        → markdown-it 內建 (tables: true)
 *   fenced_code   → markdown-it 內建 (fenced: true)
 *   nl2br         → breaks: true（每行換行 → <br>）
 *   attr_list     → markdown-it-attrs 插件
 *   sane_lists    → markdown-it 內建（行為差異小，以 lists: true 模擬）
 */
function createMarkdownIt(extensions: string[]): MarkdownIt {
  const opts: MarkdownItOptions = {
    html: true,
    xhtmlOut: false,
    breaks: extensions.includes("nl2br"),
    linkify: false,
    typographer: false,
  };
  const md = new MarkdownIt(opts);
  if (extensions.includes("attr_list")) {
    md.use(markdownItAttrs);
  }
  return md;
}

/**
 * 將 Markdown 文字轉換為 HTML（對應 Python markdown_to_html()）。
 * 包含：heading id 注入、code block brace 轉義、code fence 語言屬性、table cell XSS 過濾。
 * @param codeHighlight - true 時在後端直接套用 highlight.js，輸出帶 span 的靜態 HTML。
 */
export function markdownToHtml(markdownText: string, extensions: string[], codeHighlight?: boolean): string {
  const md = createMarkdownIt(extensions);

  // 覆寫 fence renderer
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info ? token.info.trim().split(/\s+/)[0] : "";
    if (lang) {
      if (codeHighlight) {
        // ── 後端高亮：直接呼叫 hljs，不需前端載入 JS ──
        const highlighted = hljs.getLanguage(lang)
          ? hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value
          : md.utils.escapeHtml(token.content); // 不支援的語言退回純文字
        return `<pre data-lang="${lang}"><code class="language-${lang}">${highlighted}</code></pre>\n`;
      }
      // ── 前端高亮模式：保留原有邏輯 ──
      token.info = "";  // 清除語言以使用預設渲染
      const rendered = defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
      return rendered.replace(
        /^<pre><code[^>]*>/,
        `<pre data-lang="${lang}"><code class="language-${lang}">`,
      );
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  let html = md.render(markdownText);
  html = addHeadingIds(html);
  html = escapeCodeBlocks(html);
  html = sanitizeTableCells(html);
  return html;
}
