# CLI Reference

## 參數

| 參數 | 說明 | 範例 |
|------|------|------|
| `--source PATH` | Markdown 來源（檔案或目錄） | `--source ./README.md` 或 `--source ./docs` |
| `--output PATH` | 輸出 HTML 路徑 | `--output ./dist/index.html` |
| `--output-dir DIR` | 輸出資料夾（與 `--output-filename` 合併使用） | `--output-dir ./dist` |
| `--output-filename NAME` | 輸出檔名（與 `--output-dir` 合併使用） | `--output-filename guide.html` |
| `--template NAME` | 模板名稱 | `--template minimal` |
| `--locale CODE` | 語系代碼（單語模式） | `--locale zh-TW` |
| `--i18n-mode true\|false` | 啟用/關閉多語言模式 | `--i18n-mode false` |
| `--img-to-base64 true\|false` | 將圖片嵌入為 base64（本地+遠端） | `--img-to-base64 true` |
| `--img-max-width PIXELS` | 限制圖片最大寬度（需要 sharp） | `--img-max-width 400` |
| `--img-compress QUALITY` | 圖片壓縮品質 1-100（需要 sharp） | `--img-compress 80` |

> `--output` 的優先權高於 `--output-dir` + `--output-filename` 的組合。

## 設定方式（優先順序）

設定可透過以下三種方式指定，優先順序如下：

### 1. CLI 參數（最高優先）

```bash
npx mdsone --source ./docs --output ./dist/index.html --i18n-mode false
```

### 2. 環境變數

```bash
export MARKDOWN_SOURCE_DIR="./docs"
export OUTPUT_FILE="./dist/index.html"
export I18N_MODE="false"
npx mdsone
```

在 CI 環境（如 GitHub Actions）中特別重要：

```yaml
env:
  MARKDOWN_SOURCE_DIR: "./docs"
  OUTPUT_FILE: "./dist/index.html"
  I18N_MODE: "true"
  SITE_TITLE: "My Documentation"
steps:
  - run: npm ci
  - run: npx mdsone
```

### 3. config.toml（本地開發推薦）

```toml
[paths]
markdown_source_dir = "./docs"
output_file = "./dist/index.html"

[build]
default_template = "normal"
img_to_base64 = true
img_max_width = 600
img_compress = 90

[i18n]
mode = true
default_locale = "zh-TW"
```

```bash
npx mdsone
# 本地開發時也可以用
npm start
```

### 4. 預設值

若上述三種皆未設定，使用內建預設值。

## 參數與配置的對應

| 功能 | CLI 參數 | 環境變數 | config.toml |
|------|---------|---------|-------------|
| Markdown 來源 | `--source` | `MARKDOWN_SOURCE_DIR` | `[paths] markdown_source_dir` |
| 輸出路徑 | `--output` | `OUTPUT_FILE` | `[paths] output_file` |
| 輸出資料夾 | `--output-dir` | `OUTPUT_DIR` | `[paths] output_dir` |
| 輸出檔名 | `--output-filename` | `OUTPUT_FILENAME` | `[paths] output_filename` |
| 模板 | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template` |
| 語系 | `--locale` | `LOCALE` | `[i18n] locale` |
| 多語言模式 | `--i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| 預設語系 | 無 | `DEFAULT_LOCALE` | `[i18n] default_locale` |
| 頁面標題 | 無 | `SITE_TITLE` | `[site] title` |
| 主題 | 無 | `THEME_MODE` | `[site] theme_mode` |
| 壓縮 HTML | 無 | `MINIFY_HTML` | `[build] minify_html` |
| 建置日期 | 無 | `BUILD_DATE` | `[build] build_date` |
| 圖片 base64 嵌入 | `--img-to-base64` | `IMG_TO_BASE64` | `[build] img_to_base64` |
| 圖片最大寬度 | `--img-max-width` | `IMG_MAX_WIDTH` | `[build] img_max_width` |
| 圖片壓縮品質 | `--img-compress` | `IMG_COMPRESS` | `[build] img_compress` |

## 使用範例

### 本地開發（使用 config.toml）

```bash
# 預設讀取 config.toml 設定
npx mdsone

# CLI 參數覆褂 config.toml
npx mdsone --source ./custom-docs --output ./dist/index.html
```

### CI 環境（使用環境變數）

```yaml
env:
  MARKDOWN_SOURCE_DIR: "./docs"
  OUTPUT_FILE: "./docs/index.html"
  I18N_MODE: "true"
  DEFAULT_LOCALE: "zh-TW"
  IMG_TO_BASE64: "true"
  IMG_MAX_WIDTH: "600"
  IMG_COMPRESS: "90"
steps:
  - run: npm ci
  - run: npx mdsone
```

### 快速測試

```bash
# 關閉多語言模式，指定來源與輸出
npx mdsone --source ./test --output ./test/output.html --i18n-mode false

# 啟用多語言，使用 normal 模板
npx mdsone --source ./docs --output ./dist/index.html --template normal --i18n-mode true

# 嵌入圖片為 base64（無 resize）
npx mdsone --source ./docs --output ./dist/index.html --img-to-base64 true

# 嵌入圖片並 resize + 壓縮（需要 sharp）
npx mdsone --source ./docs --output ./dist/index.html --img-to-base64 true --img-max-width 600 --img-compress 90
```