# config.toml

Use `config.toml` to manage stable project defaults.

```bash
npx mdsone --config ./config.toml
```

## Example

```toml
[paths]
source = "./docs"
output_file = "./dist/index.html"
templates_dir = "templates"

[build]
default_template = "normal@warm-cream"  # <theme-or-path>[@variant]
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
order = ["image", "katex", "shiki", "copy", "line_number", "minify"]
copy = { enable = true, mode = "off" }
shiki = { enable = true }
katex = { enable = false, mode = "woff2" }
line_number = { enable = false }
image = { embed = "off", max_width = 0, compress = 0 }
minify = { enable = false }
```

## Notes

- No `.env` auto-loading. Runtime order is: CLI > ENV > TOML > defaults.
- Shiki theme selection is controlled by template variant (`template.config.json`), not by `config.toml`.
- `plugins.order` controls plugin execution order. `minify` is still forced to run last for output-stage processing.
- `--template` supports `name@variant` and direct template folder path.