# CLI Parameters

## Syntax

```bash
mdsone [options] [inputs...]
```

## Options

| Option | Description | Example |
|---|---|---|
| `-v, --version` | Show CLI version | `--version` |
| `<inputs...>` | Input markdown source: single file, multiple files, or one folder | `README.md`, `a.md b.md`, `./docs` |
| `-m, --merge` | Merge all input docs into one HTML | `-m` |
| `-o, --output <PATH>` | Output path. In merge mode: file path. In batch mode: file path (single file input) or directory (multi/folder input) | `-o dist/index.html` |
| `-f, --force` | Overwrite existing output file(s) | `--force` |
| `-t, --template <NAME|PATH[@VARIANT]>` | Template name/path with optional variant | `-t normal@warm-cream` |
| `--title <TEXT>` | Site title shown in output HTML | `--title "My Docs"` |
| `-i, --i18n-mode [CODE]` | Enable i18n mode. Optional default locale with `--i18n-mode=CODE` | `-i=zh-TW` |
| `--template-dev` | Start template development server (source checkout only) | `--template-dev` |
| `-c, --config <PATH>` | Specify `config.toml` path | `-c ./config.toml` |
| `-h, --help` | Show help message | `--help` |

## Markdown Options

| Option | Description | Example |
|---|---|---|
| `--md-linkify [on|off]` | Markdown-it `linkify`; bare flag means `on` | `--md-linkify`, `--md-linkify=off` |
| `--md-typographer [on|off]` | Markdown-it `typographer`; bare flag means `on` | `--md-typographer=off` |
| `--md-breaks [on|off]` | Markdown-it `breaks`; bare flag means `on` | `--md-breaks` |
| `--md-xhtml-out [on|off]` | Markdown-it `xhtmlOut`; bare flag means `on` | `--md-xhtml-out=off` |

## Plugin Options

| Option | Description | Example |
|---|---|---|
| `--img-embed <off|base64>` | Image embedding mode | `--img-embed=base64` |
| `--img-max-width <pixels>` | Max output image width (requires `sharp`) | `--img-max-width 400` |
| `--img-compress <1-100>` | Image compression quality (requires `sharp`) | `--img-compress 80` |
| `--katex [mode]` | KaTeX mode: auto/`woff2` by default, `full` for all fonts, `off` to disable | `--katex`, `--katex=full`, `--katex=off` |
| `--code-highlight <off>` | Disable syntax highlighting | `--code-highlight=off` |
| `--code-mermaid <off>` | Disable Mermaid diagram rendering | `--code-mermaid=off` |
| `--code-copy <off|line|cmd>` | Code copy button mode | `--code-copy=cmd` |
| `--code-line-number [off]` | Enable line numbers (`=off` to disable) | `--code-line-number` |
| `--minify [off]` | Minify final output HTML (`off` to disable) | `--minify` |

## MCP

| Command | Description |
|---|---|
| `mdsone mcp` | Run MCP mode (`mdsone mcp --help` for subcommands) |

KaTeX default behavior:

- Without `--katex`, KaTeX stays in auto mode.
- Formulas are rendered when math syntax is present.
- If no formulas are rendered, no KaTeX CSS/fonts are injected.

## Strict CLI Style

For these options, use `=` when passing values:

- `--i18n-mode=zh-TW`
- `--img-embed=base64`
- `--code-copy=cmd`
- `--code-highlight=off`
- `--code-line-number=off`
- `--md-linkify=off`
- `--md-typographer=off`
- `--md-breaks=off`
- `--md-xhtml-out=off`

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
| Template | `--template` | `TEMPLATE` | `[build] template` |
| Site title | `--title` | `SITE_TITLE` | `[site] title` |
| i18n mode | `-i, --i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| Default locale | `-i=CODE, --i18n-mode=CODE` | `I18N_DEFAULT_LOCALE` | `[i18n] i18n_default_locale` |
| Build date | - | `BUILD_DATE` | `[build] build_date` |
| Markdown linkify | `--md-linkify=...` | `MARKDOWN_LINKIFY` | `[markdown] linkify` |
| Markdown typographer | `--md-typographer=...` | `MARKDOWN_TYPOGRAPHER` | `[markdown] typographer` |
| Markdown breaks | `--md-breaks=...` | `MARKDOWN_BREAKS` | `[markdown] breaks` |
| Markdown XHTML output | `--md-xhtml-out=...` | `MARKDOWN_XHTML_OUT` | `[markdown] xhtml_out` |
| Image embed | `--img-embed=...` | `IMG_EMBED` | `[plugins.image] embed` |
| Image width | `--img-max-width` | `IMG_MAX_WIDTH` | `[plugins.image] max_width` |
| Image compression | `--img-compress` | `IMG_COMPRESS` | `[plugins.image] compress` |
| Highlight | `--code-highlight=off` | `CODE_HIGHLIGHT` | `[plugins."code-highlight"] enable` |
| Mermaid | `--code-mermaid=off` | `CODE_MERMAID` | `[plugins."code-mermaid"] enable` |
| Code copy | `--code-copy=...` | `CODE_COPY` | `[plugins."code-copy"] mode` |
| Line numbers | `--code-line-number` | `CODE_LINE_NUMBER` | `[plugins."code-line-number"] enable` |
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
