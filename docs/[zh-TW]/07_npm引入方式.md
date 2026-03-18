# NPM 引入方式

本篇補充「在程式碼中使用 mdsone」的最小方式。

## 安裝

```bash
npm install mdsone
```

## 匯入規則

- Core API：`mdsone/core`
- Node I/O API：`mdsone/node`

## 單一 Markdown 轉 HTML（Node）

```ts
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_CONFIG,
  markdownToHtml,
  buildHtml,
  getAllTemplateStrings,
} from "mdsone/core";
import { loadTemplateFiles, loadLocaleFile } from "mdsone/node";

const mdText = await readFile("./README.md", "utf8");

// 這裡使用你專案中的模板與語系檔路徑
const templateRoot = path.resolve("./templates");
const templateName = "normal";
const localeRoot = path.resolve("./locales");

const templateData = await loadTemplateFiles(templateRoot, templateName);
const localeFile = await loadLocaleFile(localeRoot, "zh-TW");

const bodyHtml = markdownToHtml(
  mdText,
  DEFAULT_CONFIG.markdown_extensions,
  true,
  0,
);

const html = buildHtml({
  config: {
    ...DEFAULT_CONFIG,
    default_template: templateName,
    site_title: "My Docs",
    i18n_mode: false,
    template_variant: "default",
  },
  templateData,
  documents: { index: bodyHtml },
  i18nStrings: getAllTemplateStrings(localeFile, "2026.03.18"),
});

await writeFile("./output.html", html, "utf8");
```

## Web 前端用法

前端建議只使用 `mdsone/core`。  
`mdsone/node` 依賴 Node.js 檔案系統，不適用瀏覽器。

### 方式一：只把 Markdown 轉成 HTML 片段（最小用法）

```ts
import { markdownToHtml, DEFAULT_CONFIG } from "mdsone/core";

const md = `# Hello mdsone

- item 1
- item 2
`;

const html = markdownToHtml(md, DEFAULT_CONFIG.markdown_extensions, true, 0);
document.querySelector("#preview")!.innerHTML = html;
```

### 方式二：前端自行提供模板，輸出完整 HTML

```ts
import {
  DEFAULT_CONFIG,
  markdownToHtml,
  buildHtml,
  getAllTemplateStrings,
} from "mdsone/core";

const templateData = {
  css: "body{font-family:sans-serif;max-width:860px;margin:40px auto;padding:0 16px;}",
  template: `
<!doctype html>
<html lang="{LANG}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{TITLE}</title>
  <style>{CSS_CONTENT}</style>
  {LIB_CSS}
  {EXTRA_CSS}
</head>
<body>
  <main id="app"></main>
  {MDSONE_DATA_SCRIPT}
  <script>
    const docs = window.mdsone_DATA?.docs || [];
    document.getElementById("app").innerHTML = docs[0]?.html || "";
  </script>
  {LIB_JS}
  {EXTRA_JS}
</body>
</html>
`,
  assets_css: [],
  assets_js: [],
  version: "1.0.0",
  schema_version: "v1",
  metadata: {},
  toc_config: { enabled: false, levels: [2, 3] },
  config: { palette: "default", types: { default: { palette: "default" } } },
} as const;

const md = "# Frontend Build\\n\\n這是由 mdsone/core 組裝的完整 HTML。";
const bodyHtml = markdownToHtml(md, DEFAULT_CONFIG.markdown_extensions, true, 0);

const fullHtml = buildHtml({
  config: { ...DEFAULT_CONFIG, site_title: "Web Demo", i18n_mode: false, template_variant: "default" },
  templateData,
  documents: { index: bodyHtml },
  i18nStrings: getAllTemplateStrings({ cli: {}, template: { html_lang: "zh-TW" } }, "2026.03.18"),
});

console.log(fullHtml);
```

## 注意

- `mdsone/core` 只負責核心轉換與組裝，不會自動執行 plugins。
- 若你要完整 plugin 流程（例如 image/shiki/copy/line-number），目前建議先使用 CLI。
