# CLI 命令參數

## 語法

```
mdsone <inputs...> [-m] [-o output_path] [-f <boolean>] [options]
```

## 參數一覽

| 參數 / 選項 | 說明 | 範例 |
|------------|------|------|
| `<inputs...>` | 輸入來源：單一檔、多個檔、或單一資料夾 | `README.md` \| `f1.md f2.md` \| `./docs` |
| `-m, --merge` | 合併所有輸入為**單一** HTML 輸出 | `-m` |
| `-o, --output PATH` | 輸出路徑（合併模式 → 檔案；批次模式 → 目錄） | `-o dist/index.html` \| `-o dist/` |
| `-f, --force <boolean>` | 覆蓋模式開關（預設 `true`） | `-f false` |
| `--template NAME` | 模板名稱 | `--template minimal` |
| `--locale CODE` | 語系代碼（單語模式） | `--locale zh-TW` |
| `--img-base64-embed true\|false` | 將圖片嵌入為 base64（本地+遠端） | `--img-base64-embed true` |
| `--img-max-width PIXELS` | 限制圖片最大寬度（需要 sharp） | `--img-max-width 400` |
| `--img-compress QUALITY` | 圖片壓縮品質 1-100（需要 sharp） | `--img-compress 80` |
| `--code-highlight enable\|disable` | 語法高亮（預設 enable） | `--code-highlight disable` |
| `--code-copy enable\|disable` | 程式碼複製按鈕（預設 enable） | `--code-copy disable` |
| `--code-highlight-theme NAME` | highlight.js 深色主題名稱 | `--code-highlight-theme github-dark` |
| `--code-highlight-theme-light NAME` | highlight.js 淺色主題名稱 | `--code-highlight-theme-light github` |
| `--config PATH` | 指定 config.toml 路徑 | `--config ./config.toml` |
| `--no-config` | 忽略 config.toml | `--no-config` |

## 兩種運作模式

### 批次模式（預設，不加 `-m`）

每個 Markdown 檔案各自產生一個獨立的 HTML 檔案。

| 輸入 | 輸出 | `-o` 的意義 |
|------|------|-------------|
| 單一檔案 | 單一 HTML | 可選 — 指定輸出**檔案**路徑；預設為 CWD 下同名 `.html` |
| 多個檔案 | 各自對應 HTML | 可選 — 指定輸出**目錄**；預設為 CWD |
| 單一資料夾 | 各自對應 HTML | **必填** — 必須為目錄路徑 |

> 批次多檔 / 資料夾模式使用 `-o` 時，必須為**目錄路徑**（不可包含副檔名）。

```bash
# 單一檔案 → README.html 輸出至 CWD
mdsone README.md

# 單一檔案，指定輸出路徑
mdsone README.md -o dist/index.html

# 多個檔案 → a.html + b.html 輸出至 CWD
mdsone a.md b.md

# 多個檔案，指定輸出目錄
mdsone a.md b.md -o ./dist

# 資料夾 → 每個 .md 各自產生對應 .html（-o 必填）
mdsone ./docs -o ./dist
```

### 合併模式（`-m`）

所有輸入合併為**單一** HTML 檔案，以分頁（tab）方式呈現。

| 輸入 | 預設輸出檔名 | `-o` 的意義 |
|------|-------------|-------------|
| 單一檔案 | CWD 下 `<name>.html` | 可選 — 指定輸出**檔案**路徑 |
| 多個檔案 | CWD 下 `merge.html` | 可選 — 指定輸出**檔案**路徑 |
| 單一資料夾 | CWD 下 `<dirname>.html` | 可選 — 指定輸出**檔案**路徑 |

> 合併模式的 `-o` 必須為**檔案路徑**（如 `output.html`），指向目錄會報錯。

```bash
# 多個檔案合併 → merge.html 輸出至 CWD
mdsone a.md b.md -m

# 多個檔案合併，指定輸出路徑
mdsone intro.md guide.md -m -o manual.html

# 資料夾合併 → docs.html 輸出至 CWD
mdsone ./docs -m

# 資料夾合併，指定輸出路徑
mdsone ./docs -m -o dist/manual.html
```

> 不支援「檔案與資料夾混合輸入」。

## 多國語言

多國語言的檔案結構、參數與預設值已統一收錄在 `04_多國語言.md`。

## 覆蓋保護 (`-f`)

| 旗標 | 行為 |
|------|------|
| `-f true`（預設） | 直接覆蓋已存在的輸出 |
| `-f false`（合併模式） | 目標檔已存在則中止並報錯 |
| `-f false`（批次模式） | 目標檔已存在則**跳過**該檔並輸出警告，繼續處理其餘檔案 |

```bash
# 若 output.html 已存在則中止
npx mdsone README.md -o output.html -f false
```

## 設定方式（優先順序）

設定可透過以下四種方式指定，優先順序由高到低：

### 1. CLI 參數（最高優先）

```bash
npx mdsone ./docs -o ./dist/index.html --template normal
```

### 2. 環境變數

```bash
export MARKDOWN_SOURCE_DIR="./docs"
export OUTPUT_FILE="./dist/index.html"
npx mdsone
```

在 CI 環境（如 GitHub Actions）中特別重要：

```yaml
env:
  MARKDOWN_SOURCE_DIR: "./docs"
  OUTPUT_FILE: "./dist/index.html"
  SITE_TITLE: "My Documentation"
steps:
  - run: npm ci
  - run: npx mdsone
```

### 3. config.toml（本地開發推薦）

```toml
[paths]
source = "./docs"         # 無 CLI inputs 時的 fallback 來源
output_file = "./dist/index.html"

[build]
default_template = "normal"

[plugins]
image = { base64_embed = true, max_width = 600, compress = 90 }
```

### 4. 預設值

若上述三種皆未設定，使用內建預設值。

## 參數與配置的對應

| 功能 | CLI | 環境變數 | config.toml |
|------|-----|---------|-------------|
| Markdown 來源 | `<inputs...>` | `MARKDOWN_SOURCE_DIR` | `[paths] source` |
| 輸出路徑 | `-o, --output` | `OUTPUT_FILE` | `[paths] output_file` |
| 模板目錄 | — | `TEMPLATES_DIR` | `[paths] templates_dir` |
| 合併模式 | `-m, --merge` | — | — |
| 模板 | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template` |
| 語系 | `--locale` | `LOCALE` | `[i18n] locale` |
| 頁面標題 | `--site-title` | `SITE_TITLE` | `[site] title` |
| 主題 | `--theme-mode` | `THEME_MODE` | `[site] theme_mode` |
| 壓縮 HTML | `--minify-html` | `MINIFY_HTML` | `[build] minify_html` |
| 建置日期 | — | `BUILD_DATE` | `[build] build_date` |
| Markdown 擴充 | — | `MARKDOWN_EXTENSIONS` | `[build] markdown_extensions` |
| 圖片 base64 嵌入 | `--img-base64-embed` | `IMG_TO_BASE64` | `[plugins.image] base64_embed` |
| 圖片最大寬度 | `--img-max-width` | `IMG_MAX_WIDTH` | `[plugins.image] max_width` |
| 圖片壓縮品質 | `--img-compress` | `IMG_COMPRESS` | `[plugins.image] compress` |
| 語法高亮 | `--code-highlight` | `CODE_HIGHLIGHT` | `[plugins.highlight] enable` |
| 複製按鈕 | `--code-copy` | `CODE_COPY` | `[plugins.copy] enable` |
| 高亮深色主題 | `--code-highlight-theme` | `CODE_HIGHLIGHT_THEME` | `[plugins.highlight] theme` |
| 高亮淺色主題 | `--code-highlight-theme-light` | `CODE_HIGHLIGHT_THEME_LIGHT` | `[plugins.highlight] theme_light` |

## 使用範例

```bash
# --- 批次模式（預設）---

# 單一檔案
npx mdsone README.md
npx mdsone README.md -o dist/index.html

# 多個檔案 → 各自輸出至 CWD
npx mdsone a.md b.md

# 多個檔案 → 各自輸出至指定目錄
npx mdsone a.md b.md -o ./out

# 資料夾 → 每個 .md → 對應 .html（-o 目錄必填）
npx mdsone ./docs -o ./dist

# --- 合併模式（-m）---

# 多個檔案合併 → merge.html 輸出至 CWD
npx mdsone intro.md guide.md -m

# 多個檔案合併，指定輸出路徑
npx mdsone intro.md guide.md -m -o manual.html

# 資料夾合併 → docs.html 輸出至 CWD
npx mdsone ./docs -m

# 資料夾合併，指定輸出路徑
npx mdsone ./docs -m -o dist/manual.html --template normal

# 嵌入圖片為 base64
npx mdsone ./docs -m -o dist/index.html --img-base64-embed true

# 嵌入圖片並 resize + 壓縮（需要 sharp）
npx mdsone ./docs -m -o dist/index.html --img-base64-embed true --img-max-width 600 --img-compress 90

# 禁用語法高亮和複製按鈕
npx mdsone ./docs -m -o dist/index.html --code-highlight disable --code-copy disable

# 覆蓋保護
npx mdsone README.md -o output.html -f false
```


