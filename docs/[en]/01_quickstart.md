# Quick Start

## Installation

```bash
# Run directly with npx (recommended)
npx mdsone [inputs...] [options]

# Or install globally
npm install -g mdsone
```

## Basic Usage

### Single Markdown File

```bash
# Output README.html in current directory
npx mdsone README.md

# Specify output file
npx mdsone README.md -o index.html
```

### Multiple Markdown Files (Batch Mode)

```bash
# Each input file generates its own HTML
npx mdsone a.md b.md c.md

# Write outputs to a target directory
npx mdsone a.md b.md -o ./dist
```

### Folder Input

```bash
# Convert all markdown files in a folder (batch mode)
npx mdsone ./docs -o ./dist
```

### Merge Mode

```bash
# Merge multiple markdown files into one HTML
npx mdsone intro.md guide.md -m

# Merge and specify output file
npx mdsone intro.md guide.md -m -o manual.html

# Merge all markdown files in a folder
npx mdsone ./docs -m
```

## Common Options

```bash
# Use template + variant
npx mdsone ./docs -m --template normal@warm-cream

# Enable line numbers for code blocks
npx mdsone ./docs -m --code-line-number

# Enable command-copy buttons
npx mdsone ./docs -m --code-copy=cmd

# Enable image embedding as base64
npx mdsone ./docs -m --img-embed=base64

# Enable KaTeX math support
npx mdsone README.md --katex

# Full KaTeX fonts (larger output)
npx mdsone README.md --katex=full

# Minify final output HTML
npx mdsone ./docs -m --minify
```

## Overwrite Behavior

`mdsone` does not overwrite existing output files unless `-f` / `--force` is provided.

```bash
# Overwrite if target exists
npx mdsone README.md -o output.html --force
```

## i18n Mode (Multi-language)

Use locale subfolders named as `[locale]`:

```text
docs/
  [en]/
    01_quickstart.md
  [zh-TW]/
    01_intro.md
```

Run:

```bash
# Enable i18n and set default locale
npx mdsone ./docs --i18n-mode=zh-TW -o dist/index.html
```

## Configuration Priority

```text
CLI options > Environment variables > config.toml > Defaults
```