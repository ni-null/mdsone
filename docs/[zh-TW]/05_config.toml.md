# config.toml

使用 `config.toml` 管理專案的穩定預設值。

```bash
npx mdsone --config ./config.toml
```

## 範例

```toml
[paths]
source = "./docs"
output_file = "./dist/index.html"
templates_dir = "templates"

[build]
default_template = "normal@warm-cream" # 格式：<theme-or-path>[@variant]
markdown_extensions = ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"]
build_date = ""

[site]
title = "Documentation"
theme_mode = "light"

[i18n]
locale = "en"
mode = false
default_locale = ""

[markdown]
linkify = false
typographer = false
breaks = true
xhtml_out = false

[plugins]
"order" = ["image", "katex", "code-highlight", "code-copy", "code-line-number", "minify"]
"code-copy" = { enable = true, mode = "off" }
"code-highlight" = { enable = true }
"katex" = { enable = true, mode = "woff2" }
"code-line-number" = { enable = false }
"image" = { embed = "off", max_width = 0, compress = 0 }
"minify" = { enable = false }
```

## 備註

- 不會自動載入 `.env`。執行期優先序：CLI > ENV > TOML > defaults。
- 核心預設啟用註腳語法（`markdown-it-footnote`），不由 `markdown_extensions` 控制。
- `[markdown]` 對應 markdown-it 布林設定：`linkify`、`typographer`、`breaks`、`xhtml_out`。
- CLI 可用 `--md-linkify`、`--md-typographer`、`--md-breaks`、`--md-xhtml-out` 覆蓋（`on/off`，只帶旗標等同 `on`）。
- KaTeX 預設自動啟用；可用 `katex.enable = false` 或 `--katex=off` 關閉。
- 即使啟用，只有偵測到公式標記時才會注入 KaTeX CSS/字型。
- Shiki 配色由模板變體（`template.config.json`）控制，不在 `config.toml` 設定。
- `plugins.order` 控制執行順序，`minify` 仍會被強制放在最後執行。
- `--template` 支援 `name@variant` 或模板資料夾路徑。
