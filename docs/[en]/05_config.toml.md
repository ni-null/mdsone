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
order = ["image", "katex", "code-highlight", "code-copy", "code-line-number", "minify"]
"code-copy" = { enable = true, mode = "off" }
"code-highlight" = { enable = true }
katex = { enable = true, mode = "woff2" }
"code-line-number" = { enable = false }
image = { embed = "off", max_width = 0, compress = 0 }
minify = { enable = false }
```

## Notes

- No `.env` auto-loading. Runtime order is: CLI > ENV > TOML > defaults.
- Footnote syntax is enabled in core by default (`markdown-it-footnote`) and is not controlled by `markdown_extensions`.
- KaTeX is auto-enabled by default. Set `katex.enable = false` (or `--katex=off`) to disable completely.
- Even when enabled, KaTeX CSS/fonts are injected only when rendered formula markup exists.
- Shiki theme selection is controlled by template variant (`template.config.json`), not by `config.toml`.
- `plugins.order` controls plugin execution order. `minify` is still forced to run last for output-stage processing.
- `--template` supports `name@variant` and direct template folder path.

