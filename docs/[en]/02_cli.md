# CLI Parameters

## Syntax

```bash
mdsone <inputs...> [options]
```

## Core Options

| Option | Description | Example |
|---|---|---|
| `<inputs...>` | Input markdown source: single file, multiple files, or one folder | `README.md`, `a.md b.md`, `./docs` |
| `-m, --merge` | Merge all input docs into one HTML | `-m` |
| `-o, --output <PATH>` | Output path. In merge mode: file path. In batch mode: file path (single file input) or directory (multi/folder input) | `-o dist/index.html` |
| `-f, --force` | Overwrite existing output file(s) | `--force` |
| `-t, --template <NAME|PATH[@VARIANT]>` | Template name/path with optional variant | `-t normal@warm-cream` |
| `--site-title <TEXT>` | Site title shown in output HTML | `--site-title "My Docs"` |
| `--i18n-mode [CODE]` | Enable i18n mode. Optional default locale with `--i18n-mode=CODE` | `--i18n-mode=zh-TW` |
| `--config <PATH>` | Specify `config.toml` path | `--config ./config.toml` |

## Plugin Options

| Option | Description | Example |
|---|---|---|
| `--img-embed <off|base64>` | Image embedding mode | `--img-embed=base64` |
| `--img-max-width <pixels>` | Max output image width (requires `sharp`) | `--img-max-width 400` |
| `--img-compress <1-100>` | Image compression quality (requires `sharp`) | `--img-compress 80` |
| `--katex [mode]` | Enable KaTeX math rendering (`woff2` by default; `full` for all fonts) | `--katex`, `--katex=full` |
| `--code-highlight <off>` | Disable syntax highlighting | `--code-highlight=off` |
| `--code-copy <off|line|cmd>` | Code copy button mode | `--code-copy=cmd` |
| `--code-line-number [off]` | Enable line numbers (`=off` to disable) | `--code-line-number` |
| `--minify [off]` | Minify final output HTML (`off` to disable) | `--minify` |

## Strict CLI Style

For these options, use `=` when passing values:

- `--i18n-mode=zh-TW`
- `--img-embed=base64`
- `--code-copy=cmd`
- `--code-highlight=off`
- `--code-line-number=off`

Space form like `--code-copy cmd` is rejected intentionally.

## Operating Modes

### Batch Mode (default)

Without `-m`, each markdown file generates its own HTML.

### Merge Mode (`-m`)

With `-m`, all input docs are merged into one HTML with tab sections.

### i18n Mode (`--i18n-mode`)

i18n mode requires a single folder input with `[locale]` subfolders and uses merge flow.

## Environment and TOML Mapping

| Feature | CLI | ENV | TOML |
|---|---|---|---|
| Source input | `<inputs...>` | `MARKDOWN_SOURCE_DIR` | `[paths] source` |
| Output | `-o, --output` | `OUTPUT_FILE` | `[paths] output_file` |
| Template | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template` |
| Site title | `--site-title` | `SITE_TITLE` | `[site] title` |
| i18n mode | `--i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| Default locale | `--i18n-mode=CODE` | `DEFAULT_LOCALE` | `[i18n] default_locale` |
| Build date | - | `BUILD_DATE` | `[build] build_date` |
| Markdown extensions | - | `MARKDOWN_EXTENSIONS` | `[build] markdown_extensions` |
| Image embed | `--img-embed=...` | `IMG_EMBED` | `[plugins.image] embed` |
| Image width | `--img-max-width` | `IMG_MAX_WIDTH` | `[plugins.image] max_width` |
| Image compression | `--img-compress` | `IMG_COMPRESS` | `[plugins.image] compress` |
| Highlight | `--code-highlight=off` | `CODE_HIGHLIGHT` | `[plugins.shiki] enable` |
| Code copy | `--code-copy=...` | `CODE_COPY` | `[plugins.copy] mode` |
| Line numbers | `--code-line-number` | `CODE_LINE_NUMBER` | `[plugins.line_number] enable` |
| Minify | `--minify` | - | `[plugins.minify] enable` |

## Examples

```bash
# Merge folder docs
npx mdsone ./docs -m

# i18n build with default locale
npx mdsone ./docs --i18n-mode=zh-TW -o dist/index.html

# Disable highlight and copy buttons
npx mdsone ./docs -m --code-highlight=off --code-copy=off
```