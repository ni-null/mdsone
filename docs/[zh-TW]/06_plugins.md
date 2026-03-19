# Plugins

目前內建 plugin：

- `image`
- `shiki`
- `copy`
- `line_number`

所有 plugin 都在核心 Markdown 轉 HTML 後才介入，流程如下：

1. 核心先輸出一般 `<pre><code class="language-xxx">...</code></pre>`
2. `PluginManager.processHtml()` 依序處理 HTML
3. `PluginManager.getAssets()` 收集各 plugin 的 CSS / JS 注入最終頁面

## image

用途：

- 掃描 HTML 內 `<img src="...">`
- 將本機或遠端圖片轉為 base64 data URL
- 已經是 `data:` 的圖片會略過

CLI：

```bash
npx mdsone README.md -o index.html --img-embed=base64
npx mdsone README.md -o index.html --img-embed=base64 --img-max-width 400
npx mdsone README.md -o index.html --img-embed=base64 --img-max-width 400 --img-compress 80
```

TOML：

- `[plugins.image].embed`（`off` 或 `base64`）
- `[plugins.image].max_width`
- `[plugins.image].compress`

## shiki

用途：

- 將 `<pre><code>` 區塊改寫為 Shiki 高亮結果
- 高亮在 plugin 層處理，核心不直接耦合 Shiki

CLI：

```bash
npx mdsone README.md -o index.html --code-highlight=off
```

TOML：

- `[plugins.shiki].enable`

模板設定（`template.config.json`）：

- `config.types.<name>.code.Shiki.dark`
- `config.types.<name>.code.Shiki.light`
- `config.types.<name>.code.Shiki.auto_detect`

說明：

- fenced code 有指定語言時直接使用該語言
- 未指定語言時，若 `auto_detect=true`，會用 `highlight.js` 自動判斷語言再交給 Shiki

## copy

用途：

- 在程式碼區塊提供複製功能
- 支援一般區塊複製，以及額外的逐行 / 指令段落複製模式

CLI：

```bash
# 關閉複製
npx mdsone README.md -o index.html --code-copy=off

# 逐行指令複製
npx mdsone README.md -o index.html --code-copy=line

# 指令段落複製（以註解區塊分段）
npx mdsone README.md -o index.html --code-copy=cmd
```

TOML：

- `[plugins.copy].enable`
- `[plugins.copy].mode`（`off` / `line` / `cmd`）

## line_number

用途：

- 在程式碼區塊加上行號
- 若 copy plugin 已先包裝 `.code-line`，會在原結構上補行號，不重複包裝

CLI：

```bash
npx mdsone README.md -o index.html --code-line-number
npx mdsone README.md -o index.html --code-line-number=off
```

TOML：

- `[plugins.line_number].enable`

## config.toml 範例

```toml
[plugins]
order = ["image", "shiki", "copy", "line_number"]
copy = { enable = true, mode = "off" }
shiki = { enable = true }
line_number = { enable = false }
image = { embed = "off", max_width = 0, compress = 0 }
```

## 執行順序

預設順序：

1. `image`
2. `shiki`
3. `copy`
4. `line_number`

可用 `[plugins].order` 自訂順序；未列出的 plugin 會排在後面。

## katex

用途：
1. 於 Markdown 前置階段註冊 `markdown-it-katex`（支援數學公式）
2. 透過 `getAssets()` 內嵌 KaTeX CSS

CLI：
```bash
npx mdsone README.md -o index.html --katex
npx mdsone README.md -o index.html --katex=full
```

TOML：
```toml
[plugins.katex]
enable = true
mode = "full"
```

`mode` 可省略（預設為 `woff2`）；設為 `full` 時會內嵌所有 KaTeX 字型。
