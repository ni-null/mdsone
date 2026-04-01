<p align="center">
  <img width="160" height="160" alt="mdsone" src="https://github.com/user-attachments/assets/bfa9fe31-4bd2-4568-aa45-f40d16564b97" />
</p>

<h1 align="center">mdsone - markdown, all in one html</h1>
<p align="center">
  <a href="https://www.npmjs.com/package/mdsone"><img alt="npm version" src="https://img.shields.io/npm/v/mdsone?logo=npm" /></a>
  <a href="https://www.npmjs.com/package/mdsone"><img alt="node" src="https://img.shields.io/node/v/mdsone?logo=node.js" /></a>
  <a href="https://github.com/ni-null/mdsone/actions/workflows/deploy-docs.yml"><img alt="docs build" src="https://img.shields.io/github/actions/workflow/status/ni-null/mdsone/deploy-docs.yml?label=docs%20build" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/github/license/ni-null/mdsone" /></a>
</p>

Language: English | [繁體中文](./README/zh-TW.md) | [简体中文](./README/zh-CN.md) | [日本語](./README/ja.md) | [한국어](./README/ko.md)

mdsone is a Markdown conversion tool that transforms Markdown documents into fully functional, self-contained HTML files.

## Features

- 🚀 **Zero-dependency delivery**: No server or internet required - a single HTML file opens in any browser on any device.
- 📝 **Markdown support**: CommonMark + markdown-it ecosystem.
- 🔖 **Footnotes built-in**: `markdown-it-footnote` is enabled in core by default.
- 🎨 **Built-in templates**: Responsive HTML templates included.
- 🌍 **Internationalization**: Multi-language document support (i18n).
- 📦 **Self-contained**: Generated HTML includes all necessary CSS and assets.
- 🖼️ **Image management**: Embed local and remote images as base64 (optional resize/compress).
- ⚙️ **Flexible configuration**: Supports TOML config files and CLI options.
- 🧰 **CLI-first workflow**: Focused on direct command-line docs delivery.

<img width="800" height="487" alt="Snipaste_2026-03-19_17-34-40" src="https://github.com/user-attachments/assets/6b551f2a-6ddc-4578-b81a-1d132154dbfc" />

## Quick Start

Single Markdown file:

```bash
npx mdsone README.md
```

Specify output:

```bash
npx mdsone README.md -o index.html
```

Multiple Markdown files (batch mode):

```bash
npx mdsone ./docs -o ./dist
```

Merge multiple files into a single HTML:

```bash
npx mdsone intro.md guide.md -m -o manual.html

# Or merge entire folder
npx mdsone ./docs -m -o manual.html
```

With image embedding:

```bash
npx mdsone README.md -o index.html --img-embed=base64 --img-max-width 400
```

`--img-embed` currently supports `off|base64` (Blob mode is not available yet).

## Template Structure

Template discovery and loading now require this structure:

```text
templates/<name>/
  template.html
  assets/
    style.css   # required
    *.css       # auto-inlined, sorted by filename
    *.js        # auto-inlined, sorted by filename
    svg/*.svg   # optional, merged into inline SVG sprite
```

Notes:

- `template.html` should keep `{LIB_CSS}` and `{EXTRA_CSS}` in `<head>`, and `{LIB_JS}` and `{EXTRA_JS}` before `</body>`.
- Root-level `templates/<name>/style.css` is no longer loaded.
- Template JS can be placed in `assets/app.js` (recommended) and will be auto-injected via `{EXTRA_JS}`.

## GitHub Action

Tip: You can pin a specific version for reproducible builds, for example `uses: ni-null/mdsone@v0.3.0`.

```yaml
name: Build README to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/configure-pages@v5

      - name: Convert README.md to index.html
        uses: ni-null/mdsone@main
        with:
          source: README.md
          output: _site/index.html
          force: true

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

      - id: deployment
        uses: actions/deploy-pages@v4
```

## CLI Parameters

```bash
Usage: mdsone [options] [inputs...]

Arguments:
  inputs                                Input: single file, multiple files, or single folder path

Options:
  -v, --version                         Display version
  -m, --merge                           Merge all inputs into a single HTML output
  -o, --output <PATH>                   Output HTML file path
  -f, --force                           Overwrite existing output file
  -t, --template <NAME|PATH[@VARIANT]>  Template name/path with optional variant (e.g. normal@warm-cream)
  --title <TEXT>                        Documentation site title (default: Documentation)
  -i, --i18n-mode [CODE]                Enable multi-language mode; optional CODE via --i18n-mode=CODE (e.g. --i18n-mode=zh-TW, -i=zh-TW)
  --template-dev                        Start template development server (source checkout only)
  -c, --config <PATH>                   Specify config.toml path
  -h, --help                            display help for command

Markdown:
  --md-linkify <on|off>                 Markdown-it linkify (use --md-linkify as shorthand for --md-linkify=on)
  --md-typographer <on|off>             Markdown-it typographer (use --md-typographer as shorthand for --md-typographer=on)
  --md-breaks <on|off>                  Markdown-it breaks (use --md-breaks as shorthand for --md-breaks=on)
  --md-xhtml-out <on|off>               Markdown-it xhtmlOut (use --md-xhtml-out as shorthand for --md-xhtml-out=on)

Plugins:
  --img-embed <off|base64>              Image embedding mode (use --img-embed=base64|off)
  --img-max-width <pixels>              Max image width in pixels (requires 'sharp' package)
  --img-compress <1-100>                Image compression quality 1-100 (requires 'sharp' package)
  --katex [mode]                        KaTeX mode (auto default; use --katex=off to disable, --katex=full for full fonts)
  --code-highlight <off>                Disable syntax highlighting (use --code-highlight=off)
  --code-mermaid <off>                  Disable Mermaid diagram rendering (use --code-mermaid=off)
  --code-copy <off|line|cmd>            Copy button mode (use --code-copy=off|line|cmd)
  --code-line-number [off]              Show line numbers in code blocks (use --code-line-number or --code-line-number=off)
  --minify [off]                        Minify output HTML (default: off; use --minify or --minify=off)

MCP:
  mcp                                   Run MCP mode (use `mdsone mcp --help` for subcommands)

```

 

## Acknowledgements

mdsone is built on top of excellent open-source packages:

- `markdown-it` ecosystem (`markdown-it`, `markdown-it-anchor`, `markdown-it-attrs`): Core Markdown parsing/rendering, heading ID generation, and attribute support.
- `markdown-it-footnote`: Built-in footnote syntax support in core markdown rendering.
- `markdown-it-katex` + `katex`: Optional math formula parsing and KaTeX HTML/CSS rendering.
- `shiki`: High-quality syntax highlighting output.
- `highlight.js`: Language auto-detection fallback for unlabeled code fences.
- `cheerio`: HTML AST-style rewriting for plugin post-processing.
- `sharp`: Optional image resize/compression during image embedding.
- `commander`: CLI argument parsing.
- `@iarna/toml`: `config.toml` parsing.
