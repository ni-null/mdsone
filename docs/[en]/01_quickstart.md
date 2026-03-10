# Quick Start

## Installation

```bash
# Install globally
npm install -g mdsone

# Run via npx (requires global install)
npx mdsone [options]
```

## Usage Examples

```bash
# No arguments: reads config.toml directly (recommended for local development)
npx mdsone

# Set a single Markdown file
npx mdsone --source ./README.md --output index.html

# Specify source directory and output
npx mdsone --source ./docs --output ./output.html

# Specify template and locale
npx mdsone --source ./docs --output ./output.html --template minimal --locale zh-TW

# Specify output folder and filename separately
npx mdsone --source ./docs --output-dir ./dist --output-filename guide.html

# Embed images as base64 (supports both local and remote)
npx mdsone --source ./docs --output ./output.html --img-to-base64 true

# Embed images with a maximum width
npx mdsone --source ./docs --output ./output.html --img-to-base64 true --img-max-width 400

# Embed images with compression quality
npx mdsone --source ./docs --output ./output.html --img-to-base64 true --img-compress 80
```

## Three Execution Modes

| Mode | Description |
| ---- | ----------- |
| **Mode 1: Interactive Picker** | When no required arguments are provided, a folder selection window pops up automatically (Windows / macOS) |
| **Mode 2: config.toml** | Fill in `[paths]` and other settings in `config.toml`, then run directly |
| **Mode 3: CLI Override** | Override via CLI arguments or environment variables — highest priority |

## config.toml Example

```toml
# ── Paths ────────────────────────────────────────────────────────────────────
[paths]
markdown_source_dir = "./docs"
output_file         = "./output.html"
output_dir          = "./dist"
output_filename     = "guide.html"
templates_dir       = "templates"
locales_dir         = "locales"

# ── Build ─────────────────────────────────────────────────────────────────────
[build]
default_template     = "normal"
minify_html          = false
template_config_file = "template.config.json"
build_date           = ""
markdown_extensions  = ["tables", "fenced_code", "nl2br", "sane_lists", "attr_list"]

# ── Site ──────────────────────────────────────────────────────────────────────
[site]
title      = "My Docs"
theme_mode = "dark"

# ── Internationalisation ──────────────────────────────────────────────────────
[i18n]
locale         = "zh-TW"
mode           = false
default_locale = "zh-TW"
```

> **Important**: `config.toml` should not be committed to git (already listed in `.gitignore`). Machine-specific paths should be written to this file.

## Multilingual Mode

Set `mode = true` under `[i18n]` in `config.toml`, and organize your Markdown files into `[locale]` subdirectories:

```toml
[i18n]
mode = true
default_locale = "zh-TW"
```

```text
docs/
├── [zh-TW]/
│   ├── 01_intro.md
│   └── 02_usage.md
└── [en]/
    ├── 01_intro.md
    └── 02_usage.md
```

Running the command generates a single HTML file with a built-in language switcher dropdown, and remembers the user's language preference via `localStorage`.

```bash
npx mdsone --source ./docs
```

## Priority Order

```text
CLI arguments > Environment variables > config.toml > Default values
```
