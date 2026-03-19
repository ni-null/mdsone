# CLI 命令參數

## 語法

```bash
mdsone <inputs...> [-m] [-o output_path] [-f] [options]
```

## 參數一覽

| 參數 / 選項 | 說明 | 範例 |
|------------|------|------|
| `<inputs...>` | 輸入來源：單一檔、多個檔、或單一資料夾 | `README.md`、`a.md b.md`、`./docs` |
| `-m, --merge` | 合併所有輸入為單一 HTML | `-m` |
| `-o, --output PATH` | 輸出路徑；合併模式為檔案，批次模式多檔 / 資料夾為目錄 | `-o dist/index.html` |
| `-f, --force` | 是否覆蓋既有輸出（預設不覆蓋） | `-f` |
| `-t, --template <theme-or-path>[@variant]` | 模板名稱或路徑（可附加變體） | `-t normal@warm-cream` |
| `--site-title <TEXT>` | 文件標題 | `--site-title "My Docs"` |
| `--minify [off]` | 壓縮輸出 HTML（預設關閉） | `--minify`、`--minify=off` |
| `--i18n-mode [CODE]` | 啟用多國語言模式（可選 CODE 指定預設語系；指定時僅支援 `--i18n-mode=CODE`） | `--i18n-mode=zh-TW` |
| `--config <PATH>` | 指定 `config.toml` 路徑 | `--config ./config.toml` |
| `--img-embed=<off\|base64>` | 圖片嵌入模式（預設 `off`） | `--img-embed=base64` |
| `--img-max-width <pixels>` | 圖片最大寬度 | `--img-max-width 400` |
| `--img-compress <1-100>` | 圖片壓縮品質 | `--img-compress 80` |
| `--code-highlight=<off>` | 關閉語法高亮 | `--code-highlight=off` |
| `--code-copy=<off\|line\|cmd>` | 程式碼複製模式 | `--code-copy=cmd` |
| `--code-line-number [off]` | 顯示程式碼行號；用 `=off` 可關閉 | `--code-line-number` |

## 輸入模式

### 批次模式（預設，不加 `-m`）

每個 Markdown 檔案各自輸出一個 HTML。

| 輸入 | 輸出 | `-o` 用途 |
|------|------|-----------|
| 單一檔案 | 單一 HTML | 可選；為輸出檔案路徑 |
| 多個檔案 | 多個 HTML | 可選；為輸出目錄 |
| 單一資料夾 | 多個 HTML | 必填；必須是輸出目錄 |

```bash
npx mdsone README.md
npx mdsone README.md -o dist/index.html
npx mdsone a.md b.md
npx mdsone a.md b.md -o ./dist
npx mdsone ./docs -o ./dist
```

### 合併模式（`-m`）

所有輸入會合併成單一 HTML，以 tab 方式呈現。

| 輸入 | 預設輸出 | `-o` 用途 |
|------|----------|-----------|
| 單一檔案 | `<name>.html` | 可選；為輸出檔案 |
| 多個檔案 | `merge.html` | 可選；為輸出檔案 |
| 單一資料夾 | `<dirname>.html` | 可選；為輸出檔案 |

```bash
npx mdsone intro.md guide.md -m
npx mdsone intro.md guide.md -m -o manual.html
npx mdsone ./docs -m
npx mdsone ./docs -m -o dist/manual.html
```

## 覆蓋保護

| 旗標 | 行為 |
|------|------|
| `-f` / `--force` | 直接覆蓋輸出 |
| 未指定 `-f`（合併模式） | 目標已存在時中止 |
| 未指定 `-f`（批次模式） | 已存在檔案會跳過，其餘繼續 |

## 設定優先順序

```text
CLI 參數 > 環境變數 > config.toml > 預設值
```

> 注意：環境變數僅讀取執行當下的 `process.env`（例如 shell export、Docker、CI 注入）。  
> 不會自動搜尋或載入 `.env`、`.env.local`。

## 對應關係

| 功能 | CLI | 環境變數 | config.toml |
|------|-----|----------|-------------|
| Markdown 來源 | `<inputs...>` | `MARKDOWN_SOURCE_DIR` | `[paths] source` |
| 輸出路徑 | `-o, --output` | `OUTPUT_FILE` | `[paths] output_file` |
| 模板 | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template`（可用 `name@variant`） |
| 文件標題 | `--site-title` | `SITE_TITLE` | `[site] title` |
| 壓縮 HTML | `--minify` / `--minify=off` | — | `[plugins.minify] enable` |
| 建置日期 | — | `BUILD_DATE` | `[build] build_date` |
| Markdown 擴充 | — | `MARKDOWN_EXTENSIONS` | `[build] markdown_extensions` |
| 多語模式 | `--i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| 多語預設語系 | `--i18n-mode=<CODE>` | `DEFAULT_LOCALE` | `[i18n] default_locale` |
| 圖片嵌入模式 | `--img-embed=<off\|base64>` | `IMG_EMBED` | `[plugins.image] embed` |
| 圖片最大寬度 | `--img-max-width` | `IMG_MAX_WIDTH` | `[plugins.image] max_width` |
| 圖片壓縮品質 | `--img-compress` | `IMG_COMPRESS` | `[plugins.image] compress` |
| 語法高亮 | `--code-highlight=<off>` | `CODE_HIGHLIGHT` | `[plugins.shiki] enable` |
| 程式碼複製模式 | `--code-copy=<off\|line\|cmd>` | `CODE_COPY` | `[plugins.copy] mode` |
| 程式碼行號 | `--code-line-number` | `CODE_LINE_NUMBER` | `[plugins.line_number] enable` |

## 使用範例

```bash
# 合併資料夾
npx mdsone ./docs -m

# 套用模板變體
npx mdsone ./docs -m --template normal@warm-cream

# 多國語言
npx mdsone ./docs --i18n-mode=zh-TW -o dist/index.html

# 圖片嵌入 + 壓縮
npx mdsone ./docs -m --img-embed=base64 --img-max-width 600 --img-compress 90

# 啟用 HTML 壓縮（由 minify 外掛處理）
npx mdsone ./docs -m --minify

# 關閉高亮與複製
npx mdsone ./docs -m --code-highlight=off --code-copy=off

# 顯示行號
npx mdsone ./docs -m --code-line-number
```

## KaTeX 數學公式（新）

預設關閉，帶上 `--katex` 才會啟用：

```bash
npx mdsone README.md -o index.html --katex
npx mdsone README.md -o index.html --katex=full
```

`--katex` 預設為 `woff2` 模式；`--katex=full` 會內嵌所有 KaTeX 字型。

啟用後會：
1. 在 Markdown 解析階段註冊 `markdown-it-katex`
2. 自動把 KaTeX CSS 內嵌到輸出 HTML（單檔可離線使用）
