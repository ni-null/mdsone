# Quick Start

## Installation

```bash
# Install globally
npm install -g mdsone

# Or run directly via npx (no installation required)
npx mdsone --help

# Local development
npm install
npm run build

# Install sharp for image resize/compress features
npm install sharp
```

## Running

```bash
# Run via npx (requires global installation)
npx mdsone [options]

# Local development (runs TypeScript directly, no build needed)
npm run dev
# or
npm start

# During development, you can also run with npx tsx directly
npx tsx src/cli/main.ts [options]
```

## Usage Examples

```bash
# No arguments: reads config.toml directly (recommended for local development)
npx mdsone

# **Process a single Markdown file**
npx mdsone --source ./README.md --output index.html

# Specify source directory and output
npx mdsone --source ./docs --output ./output.html

# Specify template and locale
npx mdsone --source ./docs --output ./output.html --template minimal --locale en

# Specify output folder and filename separately
npx mdsone --source ./docs --output-dir ./dist --output-filename guide.html

# **Embed images as base64 (supports both local and remote)**
npx mdsone --source ./docs --output ./output.html --img-to-base64 true

# Embed images with max width (requires sharp)
npx mdsone --source ./docs --output ./output.html --img-to-base64 true --img-max-width 400

# Embed images with compression quality (requires sharp)
npx mdsone --source ./docs --output ./output.html --img-to-base64 true --img-compress 80
```

## Three Execution Modes

| Mode                              | Description                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------- |
| **Mode 1: Interactive Picker**    | When no required arguments are provided, a folder picker dialog opens (Windows / macOS) |
| **Mode 2: config.toml**           | Fill in `[paths]` and other settings in `config.toml`, then run directly      |
| **Mode 3: CLI Override**          | Override via CLI arguments or environment variables — highest priority        |

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
locale         = "en"
mode           = false
default_locale = "en"
```

> **Important**: `config.toml` should not be committed to git (already in `.gitignore`). Machine-specific paths should be written to this file.

## Multi-language Mode

Add `mode = true` under `[i18n]` in `config.toml` and place Markdown files in `[locale]` subdirectories:

```toml
[i18n]
mode = true
default_locale = "en"
```

```text
docs/
├── [en]/
│   ├── 01_intro.md
│   └── 02_usage.md
└── [zh-TW]/
    ├── 01_intro.md
    └── 02_usage.md
```

The build produces a single HTML file with a built-in language switcher dropdown, and remembers the user's language preference via `localStorage`.

```bash
npx mdsone --source ./docs
```

## Priority Order

```text
CLI arguments > Environment variables > config.toml > Default values
```

> **Note**: In CI environments (e.g. GitHub Actions) where `config.toml` is not defined, environment variables take over all configuration; `config.toml` is the most convenient option for local development.
