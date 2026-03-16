# mdsone — Markdown to Self-Contained HTML

mdsone is a Markdown conversion tool that transforms Markdown documents into fully functional, self-contained HTML files.

## Features

- 🚀 **Zero-dependency delivery**: No server or internet required — a single HTML file that opens directly in any browser on any device
- 📝 **Markdown Support**: Full support for CommonMark standard syntax
- 🎨 **Built-in Templates**: Multiple responsive HTML templates included
- 🌍 **Internationalization**: Multi-language document support (i18n)
- 📦 **Self-Contained**: Generated HTML includes all necessary CSS and assets
- 🖼️ **Image Management**: Embed local and remote images as base64 (with optional resize/compress)
- ⚙️ **Flexible Configuration**: Supports TOML config files and CLI options
- 🔌 **Library & CLI**: Use as a command-line tool or integrate as a JavaScript library

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
npx mdsone README.md -o index.html --img-base64-embed --img-max-width 400
```

## License

[MIT](./LICENSE)

