# Quick Start

## Installation

```bash
# Run via npx (recommended)
npx mdsone [options]

# Or install globally
npm install -g mdsone
```

## Usage Examples

### Single Markdown File

```bash
# Output to current directory (e.g., README.html)
npx mdsone README.md

# Specify output file
npx mdsone README.md -o index.html
```

### Multiple Markdown Files (Batch Mode)

```bash
# Each .md produces its own .html in current directory
npx mdsone a.md b.md c.md

# Output to specified directory
npx mdsone a.md b.md -o ./dist
```

### Folder (Batch Mode)

```bash
# Each .md in folder produces corresponding .html (-o directory required)
npx mdsone ./docs -o ./dist
```

### Merge Mode

```bash
# Merge multiple files → merge.html in current directory
npx mdsone intro.md guide.md -m

# Merge multiple files with output filename
npx mdsone intro.md guide.md -m -o manual.html

# Merge entire folder
npx mdsone ./docs -m

# Merge folder with output path
npx mdsone ./docs -m -o manual.html
```

### Image Embedding

```bash
# Embed images as base64
npx mdsone README.md -o index.html --img-to-base64 true

# Embed images with max width
npx mdsone README.md -o index.html --img-to-base64 true --img-max-width 400

# Embed images with compression (requires sharp)
npx mdsone README.md -o index.html --img-to-base64 true --img-max-width 400 --img-compress 80
```

### Template and Locale

```bash
# Specify template and locale
npx mdsone ./docs -m -o output.html --template minimal --locale zh-TW
```

### Overwrite Protection

```bash
# Stop if output already exists
npx mdsone README.md -o output.html -f false
```

## Two Operating Modes

| Mode | Description |
| ---- | ------------ |
| **Batch Mode** (default) | Each Markdown file produces its own independent HTML |
| **Merge Mode** (`-m`) | All inputs merged into a single HTML with tabs |

## Multi-language Mode

Organize Markdown files into `[locale]` subdirectories:

```text
docs/
├── [zh-TW]/
│   ├── 01_intro.md
│   └── 02_usage.md
└── [en]/
    ├── 01_intro.md
    └── 02_usage.md
```

Run with `--i18n-mode` flag:

```bash
npx mdsone ./docs -m -o index.html --i18n-mode --i18n-default en
```

## Priority Order

```text
CLI arguments > Environment variables > config.toml > Default values
```
