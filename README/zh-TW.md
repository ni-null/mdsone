<p align="center">
  <img width="160" height="160" alt="mdsone" src="https://github.com/user-attachments/assets/bfa9fe31-4bd2-4568-aa45-f40d16564b97" />
</p>

<h1 align="center">mdsone — Markdown，多合一 HTML </h1>
<p align="center">
  <a href="https://www.npmjs.com/package/mdsone"><img alt="npm version" src="https://img.shields.io/npm/v/mdsone?logo=npm" /></a>
  <a href="https://www.npmjs.com/package/mdsone"><img alt="node" src="https://img.shields.io/node/v/mdsone?logo=node.js" /></a>
  <a href="https://github.com/ni-null/mdsone/actions/workflows/deploy-docs.yml"><img alt="docs build" src="https://img.shields.io/github/actions/workflow/status/ni-null/mdsone/deploy-docs.yml?label=docs%20build" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/github/license/ni-null/mdsone" /></a>
</p>

mdsone 是一個 Markdown 轉換工具，可將 Markdown 文件轉換為功能完整的自包含 HTML 檔案。

## 功能特色

- 🚀 **零依賴交付**：無需伺服器或網路——單一 HTML 檔案可直接在任何裝置的任何瀏覽器中開啟
- 📝 **Markdown 支援**：完整支援 CommonMark 標準語法
- 🎨 **內建模板**：包含多種響應式 HTML 模板
- 🌍 **國際化**：支援多語言文件（i18n）
- 📦 **自包含**：產生的 HTML 包含所有必要的 CSS 與資源
- 🖼️ **圖片管理**：可將本地與遠端圖片嵌入為 base64（支援可選的縮放與壓縮）
- ⚙️ **彈性設定**：支援 TOML 設定檔與 CLI 選項
- 🧰 **CLI 優先工作流**：專注於直接使用命令列進行文件交付

<img width="800" height="487" alt="Snipaste_2026-03-19_17-34-40" src="https://github.com/user-attachments/assets/6b551f2a-6ddc-4578-b81a-1d132154dbfc" />

## 快速開始

單一 Markdown 檔案：

```bash
npx mdsone README.md
```

指定輸出路徑：

```bash
npx mdsone README.md -o index.html
```

多個 Markdown 檔案（批次模式）：

```bash
npx mdsone ./docs -o ./dist
```

將多個檔案合併為單一 HTML：

```bash
npx mdsone intro.md guide.md -m -o manual.html

# 或合併整個資料夾
npx mdsone ./docs -m -o manual.html
```

嵌入圖片：

```bash
npx mdsone README.md -o index.html --img-embed=base64 --img-max-width 400
```

## CLI 參數

```
引數：
  inputs                                輸入：單一檔案、多個檔案或單一資料夾路徑

選項：
  -v, --version                         顯示版本
  -m, --merge                           將所有輸入合併為單一 HTML 輸出
  -o, --output <PATH>                   輸出 HTML 檔案路徑
  -f, --force                           覆蓋已存在的輸出檔案
  -t, --template <NAME|PATH[@VARIANT]>  模板名稱／路徑，可加上可選變體（例如 normal@warm-cream）
  --title <TEXT>                        文件站點標題（預設：Documentation）
  -i, --i18n-mode [CODE]                啟用多語言模式；可透過 --i18n-mode=CODE 指定語言代碼（例如 --i18n-mode=zh-TW）
  -c, --config <PATH>                   指定 config.toml 路徑
  -h, --help                            顯示說明

外掛：
  --img-embed <off|base64>              圖片嵌入模式（使用 --img-embed=base64|off）
  --img-max-width <pixels>              圖片最大寬度，單位為像素（需要 'sharp' 套件）
  --img-compress <1-100>                圖片壓縮品質，範圍 1-100（需要 'sharp' 套件）
  --katex [mode]                        KaTeX 模式（預設自動；使用 --katex=off 停用，--katex=full 載入完整字型）
  --code-highlight <off>                停用語法高亮（使用 --code-highlight=off）
  --code-copy <off|line|cmd>            複製按鈕模式（使用 --code-copy=off|line|cmd）
  --code-line-number [off]              在程式碼區塊顯示行號（使用 --code-line-number 或 --code-line-number=off）
  --minify [off]                        壓縮輸出 HTML（預設關閉；使用 --minify 或 --minify=off）

```

## 致謝

mdsone 建立於以下優秀的開源套件之上：

- `markdown-it` 生態系（`markdown-it`、`markdown-it-anchor`、`markdown-it-attrs`）：核心 Markdown 解析與渲染、標題 ID 生成及屬性支援。
- `markdown-it-katex` + `katex`：可選的數學公式解析與 KaTeX HTML/CSS 渲染。
- `shiki`：高品質語法高亮輸出。
- `highlight.js`：未標記程式碼區塊的語言自動偵測備援。
- `cheerio`：外掛後處理的 HTML AST 風格重寫。
- `sharp`：圖片嵌入時可選的縮放與壓縮功能。
- `commander`：CLI 引數解析。
- `@iarna/toml`：`config.toml` 解析。
