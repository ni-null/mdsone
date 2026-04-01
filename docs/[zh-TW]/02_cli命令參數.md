# CLI 命令參數

## 語法

```bash
mdsone [options] [inputs...]
```

## Options

| 參數 / 選項 | 說明 | 範例 |
| --- | --- | --- |
| `-v, --version` | 顯示 CLI 版本 | `--version` |
| `<inputs...>` | 輸入檔案或資料夾（可單檔、多檔、單一資料夾） | `README.md`、`a.md b.md`、`./docs` |
| `-m, --merge` | 合併輸入為單一 HTML | `-m` |
| `-o, --output <PATH>` | 輸出路徑（檔案或資料夾，依模式判定） | `-o dist/index.html` |
| `-f, --force` | 覆寫既有輸出檔 | `-f` |
| `-t, --template <NAME|PATH[@VARIANT]>` | 模板名稱或路徑，可附加變體 | `-t normal@warm-cream` |
| `--title <TEXT>` | 文件標題 | `--title "My Docs"` |
| `-i, --i18n-mode [CODE]` | 啟用多國語言模式；可用 `CODE` 指定預設語系（指定語系時請用 `-i=CODE` 或 `--i18n-mode=CODE`） | `-i=zh-TW` |
| `--template-dev` | 啟動模板開發伺服器（限 source checkout） | `--template-dev` |
| `-c, --config <PATH>` | 指定 `config.toml` 路徑 | `-c ./config.toml` |
| `-h, --help` | 顯示 help | `--help` |

## Markdown

| 參數 / 選項 | 說明 | 範例 |
| --- | --- | --- |
| `--md-linkify <on\|off>` | Markdown linkify 開關 | `--md-linkify=off` |
| `--md-typographer <on\|off>` | Markdown typographer 開關 | `--md-typographer=off` |
| `--md-breaks <on\|off>` | Markdown breaks 開關 | `--md-breaks=on` |
| `--md-xhtml-out <on\|off>` | Markdown xhtml_out 開關 | `--md-xhtml-out=off` |

## Plugins

| 參數 / 選項 | 說明 | 範例 |
| --- | --- | --- |
| `--img-embed <off\|base64>` | 圖片嵌入模式 | `--img-embed=base64` |
| `--img-max-width <pixels>` | 圖片最大寬度（需安裝 `sharp`） | `--img-max-width 400` |
| `--img-compress <1-100>` | 圖片壓縮品質（需安裝 `sharp`） | `--img-compress 80` |
| `--katex [mode]` | 數學公式模式（`off` / `full`） | `--katex=full` |
| `--code-highlight <off>` | 關閉語法高亮 | `--code-highlight=off` |
| `--code-mermaid <off>` | 關閉 Mermaid 圖表渲染 | `--code-mermaid=off` |
| `--code-copy <off\|line\|cmd>` | 程式碼複製按鈕模式 | `--code-copy=cmd` |
| `--code-line-number [off]` | 顯示或關閉程式碼行號 | `--code-line-number` |
| `--minify [off]` | 壓縮輸出 HTML | `--minify` |

## MCP

| 指令 | 說明 |
| --- | --- |
| `mdsone mcp` | 進入 MCP 模式（子命令請用 `mdsone mcp --help`） |

## 參數

```text
CLI 參數 > 環境變數 > config.toml > 預設值
```

## 參數對照（CLI / 環境變數）

| 功能 | CLI | 環境變數 |
| --- | --- | --- |
| 模板 | `-t, --template` | `TEMPLATE` |
| 標題 | `--title` | `SITE_TITLE` |
| i18n 模式 | `-i, --i18n-mode` | `I18N_MODE` |
| i18n 預設語系 | `-i=CODE, --i18n-mode=CODE` | `I18N_DEFAULT_LOCALE` |
| Markdown linkify | `--md-linkify` | `MARKDOWN_LINKIFY` |
| Markdown typographer | `--md-typographer` | `MARKDOWN_TYPOGRAPHER` |
| Markdown breaks | `--md-breaks` | `MARKDOWN_BREAKS` |
| Markdown xhtml_out | `--md-xhtml-out` | `MARKDOWN_XHTML_OUT` |
| 圖片嵌入 | `--img-embed` | `IMG_EMBED` |
| 圖片最大寬度 | `--img-max-width` | `IMG_MAX_WIDTH` |
| 圖片壓縮 | `--img-compress` | `IMG_COMPRESS` |
| 數學公式 | `--katex` | `KATEX` |
| 程式碼高亮 | `--code-highlight` | `CODE_HIGHLIGHT` |
| Mermaid | `--code-mermaid` | `CODE_MERMAID` |
| 程式碼複製 | `--code-copy` | `CODE_COPY` |
| 行號 | `--code-line-number` | `CODE_LINE_NUMBER` |
| HTML 壓縮 | `--minify` | `MINIFY` |
