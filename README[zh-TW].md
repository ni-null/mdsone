# mdsone — Markdown 轉自包含式 HTML

mdsone 是一款 Markdown 轉換工具，可將 Markdown 文件轉換為功能完整的自包含式 HTML 檔案。

## 功能特色

- 🚀 **零依賴交付**：無需伺服器、無需網路，單一 HTML 檔案在任何裝置、任何瀏覽器皆可直接開啟
- 📝 **Markdown 支援**：完整支援 CommonMark 標準語法
- 🎨 **內建範本**：提供多種響應式 HTML 範本
- 🌍 **國際化**：支援多語言文件（i18n）
- 📦 **自包含式**：生成的 HTML 包含所有必要的 CSS 與資源
- 🖼️ **圖片管理**：將本地與遠端圖片嵌入為 base64（支援選用縮放／壓縮）
- ⚙️ **彈性設定**：支援 TOML 設定檔與 CLI 選項
- 🔌 **函式庫 & CLI**：可作為命令列工具使用，或整合為 JavaScript 函式庫

## 快速開始

單一 Markdown 檔案：

```bash
npx mdsone README.md
```

指定輸出：

```bash
npx mdsone README.md -o index.html
```

多個 Markdown 檔案（批次模式）：

```bash
npx mdsone ./docs -o ./dist
```

合併多個檔案為單一 HTML：

```bash
npx mdsone intro.md guide.md -m -o manual.html
# 或合併整個資料夾
npx mdsone ./docs -m -o manual.html
```

含圖片嵌入：

```bash
npx mdsone README.md -o index.html --img-to-base64 --img-max-width 400
```

## 授權條款

[MIT](./LICENSE)
