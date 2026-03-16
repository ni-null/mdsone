# Plugin

此專案內建三個 plugin：`copy`、`highlight`、`image`。

## 參數與說明

### copy

- 功能：在程式碼區塊右上角顯示「複製」按鈕
- 設定來源：`[plugins.copy].enable`

### highlight

- 功能：語法高亮與前端主題切換
- 設定來源：`[plugins.highlight].enable`
- 相關參數：`[plugins.highlight].theme`、`[plugins.highlight].theme_light`

### image

- 功能：將 `<img>` 轉換為 base64 data URL（支援本地與遠端）
- 設定來源：`[plugins.image].base64_embed`
- 相關參數：`[plugins.image].max_width`、`[plugins.image].compress`

```bash
# 嵌入圖片為 base64
npx mdsone README.md -o index.html --img-base64-embed true

# 嵌入圖片並指定最大寬度
npx mdsone README.md -o index.html --img-base64-embed true --img-max-width 400

# 嵌入圖片並壓縮（需要 sharp）
npx mdsone README.md -o index.html --img-base64-embed true --img-max-width 400 --img-compress 80
```

## config.toml 範例

```toml
[plugins]
copy = { enable = true }
highlight = { enable = true }
image = { base64_embed = false, max_width = 0, compress = 0 }
```
