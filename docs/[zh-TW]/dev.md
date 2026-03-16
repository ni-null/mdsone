# 開發說明

本文件整理給開發者使用的說明，包含模板結構、自訂模板流程與模板佔位符。

## 模板結構

```
templates/
└── my-template/
    ├── template.html
    ├── style.css
    ├── template.config.json
    └── assets/
        ├── example1.css      # 自動掃描並注入
        └── example2.js       # 依數字前綴排序
```

### assets/ 資料夾

`assets/` 內的 CSS/JS 檔案會自動掃描並 inline 注入到模板中，無需在 `template.config.json` 明確列舉：

- **CSS 檔案** → 注入為 `<style>` 在 `<head>` 內
- **JS 檔案** → 注入為 `<script>` 在 `</body>` 前
- **排序規則** → 檔名依數字前綴排序（例：`01_base.css`、`02_theme.css`）

這是處理模板專屬樣式和邏輯的最簡單方式。

## template.config.json

```json
{
  "_metadata": {
    "version": "1.0.0",
    "schema_version": "v1"
  },
  "toc": {
    "enabled": true,
    "levels": [2, 3]
  }
}
```

| 欄位                       | 說明                                  |
| -------------------------- | ------------------------------------- |
| `_metadata.version`        | 模板版本（資訊用）                    |
| `_metadata.schema_version` | 模板配置格式版本                      |
| `toc.enabled`              | 是否顯示目錄                          |
| `toc.levels`               | 目錄涵蓋層級，如 `[2, 3]` 代表 h2、h3 |

## 新增自訂模板

```bash
# Windows PowerShell
Copy-Item -Recurse templates/minimal templates/my-template

# macOS / Linux
cp -r templates/minimal templates/my-template

# 編輯模板檔案
cd templates/my-template
# 編輯 template.html、style.css、locales 等

# 執行自訂模板
npx mdsone --template my-template

# 或在 config.toml 中指定
# [build]
# default_template = "my-template"
```

## template.html 佔位符

| 佔位符                 | 替換內容                                 |
| ---------------------- | ---------------------------------------- |
| `{TITLE}`              | 頁面標題                                 |
| `{LANG}`               | HTML lang 屬性                           |
| `{CSS_CONTENT}`        | style.css 內容                           |
| `{LIB_CSS}`            | plugin/ 外掛樣式（highlight 主題等）     |
| `{EXTRA_CSS}`          | 其他 CSS 標籤                            |
| `{LIB_JS}`             | plugin/ 外掛腳本（highlight/copy 等）    |
| `{EXTRA_JS}`           | 其他 JS 標籤                             |
| `{MDSONE_DATA_SCRIPT}` | 文件資料 JSON（window.mdsone_DATA 事件） |

## Plugin 相關補充

- 內建 plugin 放在 `plugins/` 目錄內。
- 若要新增或修改 plugin，請參考 `PLUGIN_ARCHITECTURE.md`。
