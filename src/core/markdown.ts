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
import { codeToHtml } from "shiki";

/** `[locale]` 目錄名稱的正則（例如 [en]、[zh-TW]） */
export const LOCALE_DIR_PATTERN = /^\[(.+)\]$/;

// ── 工具函式 ──────────────────────────────────────────────

/**
 * 將標題文字轉換為 URL-friendly slug（對應 Python slugify()）。
 * 規則：小寫、移除 HTML 標籤、空白/底線→連字號、移除非 ASCII 英數、去重複連字號
 * @deprecated 內部已改用 markdown-it-anchor；此函式保留供外部呼叫。
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
  return md;
}

/**
 * 將 Markdown 文字轉換為 HTML（對應 Python markdown_to_html()）。
 * 包含：heading id 注入（via markdown-it-anchor）、code block brace 轉義、
 * code fence 語言屬性、table cell XSS 過濾。
 * @param codeHighlight - true 時在後端直接套用 highlight.js，輸出帶 span 的靜態 HTML。
 * @param fileIndex     - 合併多檔時的檔案順序索引（0-based），用於確保 heading id 跨檔唯一。
 */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeShikiLang(lang: string): string {
  const v = lang.toLowerCase();
  const aliases: Record<string, string> = {
    "c#": "csharp",
    "cs": "csharp",
    "sh": "bash",
    "shell": "bash",
    "yml": "yaml",
    "md": "markdown",
    "py": "python",
    "rb": "ruby",
    "ps1": "powershell",
    "bat": "batch",
    "js": "javascript",
    "ts": "typescript",
    "tsx": "tsx",
    "jsx": "jsx",
  };
  return aliases[v] ?? v;
}

function normalizeShikiTheme(theme: string): string {
  const v = theme.toLowerCase();
  const aliases: Record<string, string> = {
    "atom-one-dark": "one-dark-pro",
    "atom-one-light": "one-light",
    "github": "github-light",
    "github-dark-dimmed": "github-dark",
  };
  return aliases[v] ?? v;
}

function renderPlainFence(md: MarkdownIt, content: string, lang: string): string {
  const escaped = md.utils.escapeHtml(content);
  return `<pre data-lang="${escapeHtmlAttr(lang)}"><code class="language-${escapeHtmlAttr(lang)}">${escaped}</code></pre>\n`;
}

function trimFenceTerminalEol(content: string): string {
  // markdown-it fence content usually ends with one terminal newline that is formatting-only.
  // Keep intentional blank lines while removing this implicit trailing line.
  if (content.endsWith("\r\n")) return content.slice(0, -2);
  if (content.endsWith("\n")) return content.slice(0, -1);
  return content;
}

function patchShikiFenceHtml(html: string, lang: string): string {
  const safeLang = escapeHtmlAttr(lang);
  const withDataLang = html.replace(/^<pre([^>]*)>/, `<pre$1 data-lang="${safeLang}">`);
  return withDataLang.replace(
    /^<pre([^>]*)><code([^>]*)>/,
    (_m, preAttrs: string, codeAttrs: string) => {
      if (/class=/.test(codeAttrs)) {
        return `<pre${preAttrs}><code${codeAttrs.replace(/class=(["'])(.*?)\1/, `class=$1$2 language-${safeLang}$1`)}>`;
      }
      return `<pre${preAttrs}><code class="language-${safeLang}"${codeAttrs}>`;
    },
  );
}

async function renderShikiFence(
  md: MarkdownIt,
  content: string,
  lang: string,
  themeDark: string,
  themeLight: string,
): Promise<string> {
  const normalized = normalizeShikiLang(lang);
  const dark = normalizeShikiTheme(themeDark);
  const light = normalizeShikiTheme(themeLight);
  const code = trimFenceTerminalEol(content);
  try {
    const shikiHtml = await codeToHtml(code, {
      lang: normalized,
      themes: { dark, light },
    });
    return `${patchShikiFenceHtml(shikiHtml, lang)}\n`;
  } catch {
    try {
      // Fallback to stable built-in theme names when user config uses hljs-only names.
      const shikiHtml = await codeToHtml(code, {
        lang: normalized,
        themes: { dark: "github-dark", light: "github-light" },
      });
      return `${patchShikiFenceHtml(shikiHtml, lang)}\n`;
    } catch {
      return renderPlainFence(md, code, lang);
    }
  }
}

export async function markdownToHtml(
  markdownText: string,
  extensions: string[],
  codeHighlight?: boolean,
  fileIndex = 0,
  codeThemeDark = "atom-one-dark",
  codeThemeLight = "atom-one-light",
): Promise<string> {
  const md = createMarkdownIt(extensions, fileIndex);

  // 覆寫 fence renderer
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info ? token.info.trim().split(/\s+/)[0] : "";
    if (lang && token.meta?.["__mdsoneFenceHtml"]) {
      return token.meta["__mdsoneFenceHtml"] as string;
    }
    if (lang) {
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

  let html = "";
  if (codeHighlight) {
    const env: Record<string, unknown> = {};
    const tokens = md.parse(markdownText, env);
    for (const token of tokens) {
      if (token.type !== "fence") continue;
      const lang = token.info ? token.info.trim().split(/\s+/)[0] : "";
      if (!lang) continue;
      token.meta = token.meta ?? {};
      token.meta["__mdsoneFenceHtml"] = await renderShikiFence(
        md,
        token.content,
        lang,
        codeThemeDark,
        codeThemeLight,
      );
    }
    html = md.renderer.render(tokens, md.options, env);
  } else {
    html = md.render(markdownText);
  }
  // addHeadingIds 已由 markdown-it-anchor 取代，不再需要後處理
  html = escapeCodeBlocks(html);
  html = sanitizeTableCells(html);
  return html;
}
