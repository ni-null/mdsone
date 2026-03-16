# config.toml 範例

以下為完整範例，直接複製後依需求修改即可。

使用方式（若不帶 `--config`）：

```bash
npx mdsone
```

指定 config.toml：

```bash
npx mdsone --config ./config.toml
```

忽略 config.toml：

```bash
npx mdsone --no-config
```

```toml
[paths]
source = "./docs"
output_file = "./dist/index.html"
templates_dir = "templates"

[build]
default_template = "normal"
minify_html = true
markdown_extensions = ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"]
build_date = ""

[site]
title = "Documentation"
theme_mode = "light"

[i18n]
locale = "en"
mode = false
default_locale = ""

[plugins]
copy = { enable = true }
highlight = { enable = true, theme = "atom-one-dark", theme_light = "atom-one-light" }
image = { base64_embed = false, max_width = 0, compress = 0 }
```
