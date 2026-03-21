// ============================================================
// src/core/markdown.ts — Markdown → HTML 純函數層
// 對應 Python src/markdown_proc.py
// 依賴：markdown-it（第三方）；零 Node.js I/O 依賴
// ============================================================

import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";
// @ts-ignore — markdown-it-attrs 沒有官方型別宣告
import markdownItAttrs from "markdown-it-attrs";
// @ts-ignore — markdown-it-anchor 型別宣告不穩，直接忽略
import markdownItAnchor from "markdown-it-anchor";
// @ts-ignore — markdown-it-footnote 無官方型別宣告
import markdownItFootnote from "markdown-it-footnote";

/** `[locale]` 目錄名稱的正則（例如 [en]、[zh-TW]） */
export const LOCALE_DIR_PATTERN = /^\[(.+)\]$/;

// ── 工具函式 ──────────────────────────────────────────────

/**
 * markdown-it-anchor 使用的 slugify：保留非 ASCII（中文），
 * 加上 `f{fileIndex}-` 前綴確保跨檔案合併時 id 唯一。
 */
function makeAnchorSlugify(fileIndex: number): (s: string) => string {
  return (s: string) => {
    const slug = String(s).trim().toLowerCase().replace(/\s+/g, "-");
    return `f${fileIndex}-${slug || "heading"}`;
  };
}

/**
 * 對 markdown-it-footnote 的錨點命名加上 `f{fileIndex}-` 前綴，
 * 避免多檔案合併到同一頁時，註腳 id (`fn*`, `fnref*`) 互相衝突。
 */
function applyFootnoteAnchorPrefix(md: MarkdownIt, fileIndex: number): void {
  const previousAnchorNameRule = md.renderer.rules.footnote_anchor_name;
  md.renderer.rules.footnote_anchor_name = (tokens, idx, options, env, self) => {
    const rawName = previousAnchorNameRule
      ? previousAnchorNameRule(tokens, idx, options, env, self)
      : "";
    const fallbackName = String(idx + 1);
    const anchorName = (typeof rawName === "string" && rawName.trim()) || fallbackName;
    return `f${fileIndex}-${anchorName}`;
  };
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
 *   footnote      → 核心固定啟用 markdown-it-footnote（不由 extensions 切換）
 *
 * @param fileIndex - 用於產生跨檔案唯一的 heading id（預設 0）
 */
function createMarkdownIt(extensions: string[], fileIndex: number): MarkdownIt {
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
  // 注入 anchor 插件：以 f{fileIndex}- 前綴 + 保留非 ASCII 的 slugify 產生穩定 id
  md.use(markdownItAnchor, {
    slugify: makeAnchorSlugify(fileIndex),
    // 不產生錨點連結符號，保持輸出乾淨
    permalink: false,
  });
  // 註腳功能為核心固定啟用。
  md.use(markdownItFootnote);
  applyFootnoteAnchorPrefix(md, fileIndex);
  return md;
}

function shouldWrapFenceByDefault(md: MarkdownIt): boolean {
  const internal = md as unknown as { __mdsoneSkipFenceWrapper?: boolean };
  return internal.__mdsoneSkipFenceWrapper !== true;
}

function applyDefaultFenceWrapper(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info ? token.info.trim().split(/\s+/)[0] : "";
    if (lang) {
      token.info = "";
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
}

/**
 * 將 Markdown 文字轉換為 HTML（對應 Python markdown_to_html()）。
 * 包含：heading id 注入（via markdown-it-anchor）、code block brace 轉義、
 * code fence 語言屬性、table cell XSS 過濾。
 * @param fileIndex     - 合併多檔時的檔案順序索引（0-based），用於確保 heading id 跨檔唯一。
 */
export function markdownToHtml(
  markdownText: string,
  extensions: string[],
  fileIndex = 0,
  extendMarkdown?: (md: MarkdownIt) => void,
): string {
  const md = createMarkdownIt(extensions, fileIndex);
  if (extendMarkdown) {
    extendMarkdown(md);
  }

  if (shouldWrapFenceByDefault(md)) {
    applyDefaultFenceWrapper(md);
  }

  const html = md.render(markdownText);
  return sanitizeTableCells(escapeCodeBlocks(html));
}

/**
 * Async markdown renderer.
 * Use this variant when plugins need async markdown-it setup.
 */
export async function markdownToHtmlAsync(
  markdownText: string,
  extensions: string[],
  fileIndex = 0,
  extendMarkdown?: (md: MarkdownIt) => void | Promise<void>,
): Promise<string> {
  const md = createMarkdownIt(extensions, fileIndex);
  if (extendMarkdown) {
    await extendMarkdown(md);
  }

  if (shouldWrapFenceByDefault(md)) {
    applyDefaultFenceWrapper(md);
  }

  const html = md.render(markdownText);
  return sanitizeTableCells(escapeCodeBlocks(html));
}
