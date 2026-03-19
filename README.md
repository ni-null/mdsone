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

