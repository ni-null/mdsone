# Quick Start

## Installation

```bash
# Install globally
npm install -g mdsone

# Run via npx (requires global installation)
npx mdsone [options]

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

# Embed images with a max width
npx mdsone --source ./docs --output ./output.html --img-to-base64 true --img-max-width 400

# Embed images with compression quality
npx mdsone --source ./docs --output ./output.html --img-to-base64 true --img-compress 80

# Disable syntax highlighting
npx mdsone --source ./docs --output ./output.html --code-highlight disable

# Disable copy button
npx mdsone --source ./docs --output ./output.html --code-copy disable

# Specify syntax highlight theme
npx mdsone --source ./docs --output ./output.html --code-highlight-theme atom-one-light
```

## Three Operating Modes

| Mode                              | Description                                                                 |
| --------------------------------- | --------------------------------------------------------------------------- |
| **Mode 1: Interactive Picker**    | When no required arguments are provided, a folder picker dialog opens automatically (Windows / macOS) |
| **Mode 2: config.toml**           | Fill in `[paths]` and other settings in `config.toml`, then run directly   |
| **Mode 3: CLI Override**          | Override via CLI arguments or environment variables — highest priority      |

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
code_highlight       = true
code_copy            = true
code_highlight_theme = "atom-one-dark"

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

> **Important**: `config.toml` should not be committed to git (already listed in `.gitignore`). Machine-specific paths should be written to this file.

## Multi-language Mode

Add `mode = true` under `[i18n]` in `config.toml`, and organize Markdown files under `[locale]` subdirectories:

```toml
[i18n]
mode = true
default_locale = "en"
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

After running, a single HTML file is generated with a built-in language switcher dropdown, and the user's language preference is remembered via `localStorage`.

```bash
npx mdsone --source ./docs
```

## Priority Order

```text
CLI arguments > Environment variables > config.toml > Default values
```
