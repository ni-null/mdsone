<p align="center">
  <img width="160" height="160" alt="mdsone" src="https://github.com/user-attachments/assets/bfa9fe31-4bd2-4568-aa45-f40d16564b97" />
</p>

<h1 align="center">mdsone — Markdown to One (HTML)</h1>
<p align="center">
  <a href="https://www.npmjs.com/package/mdsone"><img alt="npm version" src="https://img.shields.io/npm/v/mdsone?logo=npm" /></a>
  <a href="https://www.npmjs.com/package/mdsone"><img alt="node" src="https://img.shields.io/node/v/mdsone?logo=node.js" /></a>
  <a href="https://github.com/ni-null/mdsone/actions/workflows/deploy-docs.yml"><img alt="docs build" src="https://img.shields.io/github/actions/workflow/status/ni-null/mdsone/deploy-docs.yml?label=docs%20build" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/github/license/ni-null/mdsone" /></a>
</p>

mdsone is a Markdown conversion tool that transforms Markdown documents into fully functional, self-contained HTML files.

## Features

- 🚀 **Zero-dependency delivery**: No server or internet required — a single HTML file that opens directly in any browser on any device
- 📝 **Markdown Support**: Full support for CommonMark standard syntax
- 🎨 **Built-in Templates**: Multiple responsive HTML templates included
- 🌍 **Internationalization**: Multi-language document support (i18n)
- 📦 **Self-Contained**: Generated HTML includes all necessary CSS and assets
- 🖼️ **Image Management**: Embed local and remote images as base64 (with optional resize/compress)
- ∑ **Math Formulas (Optional)**: KaTeX rendering via `--katex` (default `woff2`) or `--katex=full` (all fonts)
- ⚙️ **Flexible Configuration**: Supports TOML config files and CLI options
- 🧰 **CLI-first workflow**: Focused on direct command-line usage for docs delivery

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

## CLI Parameters


```
Arguments:
  inputs                                Input: single file, multiple files, or single folder path

Options:
  -v, --version                         Display version
  -m, --merge                           Merge all inputs into a single HTML output
  -o, --output <PATH>                   Output HTML file path
  -f, --force                           Overwrite existing output file
  -t, --template <NAME|PATH[@VARIANT]>  Template name/path with optional variant (e.g. normal@warm-cream)
  --site-title <TEXT>                   Documentation site title (default: Documentation)
  --i18n-mode [CODE]                    Enable multi-language mode; optional CODE via --i18n-mode=CODE (e.g.
                                        --i18n-mode=zh-TW)
  --config <PATH>                       Specify config.toml path
  -h, --help                            display help for command

Plugins:
  --img-embed <off|base64>              Image embedding mode (use --img-embed=base64|off)
  --img-max-width <pixels>              Max image width in pixels (requires 'sharp' package)
  --img-compress <1-100>                Image compression quality 1-100 (requires 'sharp' package)
  --katex [mode]                        Enable KaTeX math rendering (default: woff2; use --katex=full for full fonts)
  --code-highlight <off>                Disable syntax highlighting (use --code-highlight=off)
  --code-copy <off|line|cmd>            Copy button mode (use --code-copy=off|line|cmd)
  --code-line-number [off]              Show line numbers in code blocks (use --code-line-number or --code-line-number=off)
  --minify [off]                        Minify output HTML (default: off; use --minify or --minify=off)

```

## Acknowledgements

mdsone is built on top of excellent open-source packages:

- `markdown-it` ecosystem (`markdown-it`, `markdown-it-anchor`, `markdown-it-attrs`): Core Markdown parsing/rendering, heading ID generation, and attribute support.
- `markdown-it-katex` + `katex`: Optional math formula parsing and KaTeX HTML/CSS rendering.
- `shiki`: High-quality syntax highlighting output.
- `highlight.js`: Language auto-detection fallback for unlabeled code fences.
- `cheerio`: HTML AST-style rewriting for plugin post-processing.
- `sharp`: Optional image resize/compression during image embedding.
- `commander`: CLI argument parsing.
- `@iarna/toml`: `config.toml` parsing.
