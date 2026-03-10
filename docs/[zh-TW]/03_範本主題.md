# Templates

## 內建模板

| 名稱 | 說明 |
|------|------|
| `normal` | 側邊欄 + TOC + 亮暗色切換 |
| `minimal` | 簡潔排版，適合輕量文件 |

```bash
npx mdsone --template normal
npx mdsone --template minimal
```

## 模板結構

```
templates/
└── my-template/
    ├── template.html
    ├── style.css
    └── template.config.json
```

## template.config.json

```json
{
  "toc": { "enabled": true, "levels": [2, 3] },
  "extra_css_urls": ["https://cdn.example.com/style.css"],
  "extra_css_inline": ["custom.css"],
  "extra_js_urls": ["https://cdn.example.com/lib.js"],
  "extra_js_inline": ["analytics.js"]
}
```

| 欄位 | 說明 |
|------|------|
| `toc.enabled` | 是否顯示目錄 |
| `toc.levels` | 目錄涵蓋層級，如 `[2, 3]` 代表 h2、h3 |
| `extra_css_urls` | CDN CSS，注入為 `<link>` |
| `extra_css_inline` | 本地 CSS（相對於模板資料夾），inline 為 `<style>` |
| `extra_js_urls` | CDN JS，注入為 `<script src>` |
| `extra_js_inline` | 本地 JS，inline 為 `<script>` |

## 新增自訂模板

```bash
# Windows PowerShell
Copy-Item -Recurse templates/minimal templates/my-template

# macOS / Linux
cp -r templates/minimal templates/my-template

# 執行自訂模板
npx mdsone --template my-template
```

## template.html 佔位符

| 佔位符 | 替換內容 |
|--------|----------|
| `{TITLE}` | 頁面標題 |
| `{LANG}` | HTML lang 屬性 |
| `{CSS_CONTENT}` | style.css 內容 |
| `{EXTRA_CSS}` | 額外 CSS 標籤 |
| `{EXTRA_JS}` | 額外 JS 標籤 |
| `{MDSONE_DATA_SCRIPT}` | 文件資料 JSON（window.mdsone_DATA 事件） |