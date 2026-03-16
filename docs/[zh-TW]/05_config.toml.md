# config.toml 範例

以下為完整範例，直接複製後依需求修改即可。

```toml
[paths]
source = "./docs"
output_file = "./dist/index.html"
templates_dir = "templates"
locales_dir = "locales"

[build]
default_template = "normal"
minify_html = true
markdown_extensions = ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"]
build_date = ""
img_to_base64 = false
img_max_width = 0
img_compress = 0
code_highlight = true
code_copy = true
code_highlight_theme = "atom-one-dark"
code_highlight_theme_light = "atom-one-light"

[site]
title = "Documentation"
theme_mode = "light"

[i18n]
locale = "en"
mode = false
default_locale = ""
```
