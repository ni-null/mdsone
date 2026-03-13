# CLI Arguments

## Syntax

```
mdsone <inputs...> [-m] [-o output_path] [-f <boolean>] [options]
```

## Arguments Overview

| Argument / Option | Description | Example |
|-------------------|-------------|---------|
| `<inputs...>` | Input source: single file, multiple files, or a single folder | `README.md` \| `f1.md f2.md` \| `./docs` |
| `-m, --merge` | Merge all inputs into a **single** HTML output | `-m` |
| `-o, --output PATH` | Output path (merge mode → file; batch mode → directory) | `-o dist/index.html` \| `-o dist/` |
| `-f, --force <boolean>` | Overwrite mode toggle (default `true`) | `-f false` |
| `--template NAME` | Template name | `--template minimal` |
| `--locale CODE` | Locale code (single-language mode) | `--locale en` |
| `--i18n-mode` | Enable multi-language mode (boolean flag, automatically triggers merge) | `--i18n-mode` |
| `--img-to-base64 true\|false` | Embed images as base64 (local + remote) | `--img-to-base64 true` |
| `--img-max-width PIXELS` | Limit maximum image width (requires sharp) | `--img-max-width 400` |
| `--img-compress QUALITY` | Image compression quality 1–100 (requires sharp) | `--img-compress 80` |
| `--code-highlight enable\|disable` | Syntax highlighting (default: enable) | `--code-highlight disable` |
| `--code-copy enable\|disable` | Code copy button (default: enable) | `--code-copy disable` |
| `--code-highlight-theme NAME` | highlight.js dark theme name | `--code-highlight-theme github-dark` |
| `--code-highlight-theme-light NAME` | highlight.js light theme name | `--code-highlight-theme-light github` |

## Two Operating Modes

### Batch Mode (default, without `-m`)

Each Markdown file produces its own independent HTML file.

| Input | Output | Meaning of `-o` |
|-------|--------|-----------------|
| Single file | Single HTML | Optional — specifies output **file** path; defaults to same name `.html` in CWD |
| Multiple files | One HTML per file | Optional — specifies output **directory**; defaults to CWD |
| Single folder | One HTML per file | **Required** — must be a directory path |

> When using `-o` in batch multi-file / folder mode, it must be a **directory path** (no file extension).

```bash
# Single file → README.html output to CWD
mdsone README.md

# Single file, specify output path
mdsone README.md -o dist/index.html

# Multiple files → a.html + b.html output to CWD
mdsone a.md b.md

# Multiple files, specify output directory
mdsone a.md b.md -o ./dist

# Folder → each .md produces its own .html (-o required)
mdsone ./docs -o ./dist
```

### Merge Mode (`-m`)

All inputs are merged into a **single** HTML file, presented as tabs.

| Input | Default Output Filename | Meaning of `-o` |
|-------|------------------------|-----------------|
| Single file | `<n>.html` in CWD | Optional — specifies output **file** path |
| Multiple files | `merge.html` in CWD | Optional — specifies output **file** path |
| Single folder | `<dirname>.html` in CWD | Optional — specifies output **file** path |

> In merge mode, `-o` must be a **file path** (e.g. `output.html`); pointing to a directory will cause an error.

```bash
# Merge multiple files → merge.html output to CWD
mdsone a.md b.md -m

# Merge multiple files, specify output path
mdsone intro.md guide.md -m -o manual.html

# Merge folder → docs.html output to CWD
mdsone ./docs -m

# Merge folder, specify output path
mdsone ./docs -m -o dist/manual.html
```

> Mixed input of files and folders is not supported.

## Multi-language Mode (`--i18n-mode`)

`--i18n-mode` is a boolean flag — simply including it enables the mode, no `true`/`false` needed.  
When enabled, merge logic is automatically applied. The input folder must contain `[locale]` subdirectories (e.g. `[en]`, `[zh-TW]`).

```bash
mdsone ./docs --i18n-mode --default-locale en -o dist/index.html
```

## Overwrite Protection (`-f`)

| Flag | Behavior |
|------|----------|
| `-f true` (default) | Directly overwrites existing output |
| `-f false` (merge mode) | Aborts with an error if the target file already exists |
| `-f false` (batch mode) | **Skips** existing target files with a warning, continues processing remaining files |

```bash
# Abort if output.html already exists
npx mdsone README.md -o output.html -f false
```

## Configuration Methods (Priority Order)

Settings can be specified in four ways, in descending priority:

### 1. CLI Arguments (Highest Priority)

```bash
npx mdsone ./docs -o ./dist/index.html --i18n-mode
```

### 2. Environment Variables

```bash
export MARKDOWN_SOURCE_DIR="./docs"
export OUTPUT_FILE="./dist/index.html"
export I18N_MODE="true"
npx mdsone
```

Especially useful in CI environments (e.g. GitHub Actions):

```yaml
env:
  MARKDOWN_SOURCE_DIR: "./docs"
  OUTPUT_FILE: "./dist/index.html"
  I18N_MODE: "true"
  SITE_TITLE: "My Documentation"
steps:
  - run: npm ci
  - run: npx mdsone
```

### 3. config.toml (Recommended for Local Development)

```toml
[paths]
source = "./docs"         # Fallback source when no CLI inputs are provided
output_file = "./dist/index.html"

[build]
default_template = "normal"
img_to_base64 = true
img_max_width = 600
img_compress = 90

[i18n]
mode = true
default_locale = "en"
```

```bash
npx mdsone
# Also usable for local development
npm start
```

### 4. Default Values

If none of the above are configured, built-in default values are used.

## Argument and Configuration Mapping

| Feature | CLI | Environment Variable | config.toml |
|---------|-----|---------------------|-------------|
| Markdown source | `<inputs...>` | `MARKDOWN_SOURCE_DIR` | `[paths] source` |
| Output path | `-o, --output` | `OUTPUT_FILE` | `[paths] output_file` |
| Merge mode | `-m, --merge` | — | — |
| Template | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template` |
| Locale | `--locale` | `LOCALE` | `[i18n] locale` |
| Multi-language mode | `--i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| Default locale | `--default-locale` | `DEFAULT_LOCALE` | `[i18n] default_locale` |
| Page title | `--site-title` | `SITE_TITLE` | `[site] title` |
| Theme | `--theme-mode` | `THEME_MODE` | `[site] theme_mode` |
| Minify HTML | `--minify-html` | `MINIFY_HTML` | `[build] minify_html` |
| Build date | — | `BUILD_DATE` | `[build] build_date` |
| Image base64 embed | `--img-to-base64` | `IMG_TO_BASE64` | `[build] img_to_base64` |
| Image max width | `--img-max-width` | `IMG_MAX_WIDTH` | `[build] img_max_width` |
| Image compression quality | `--img-compress` | `IMG_COMPRESS` | `[build] img_compress` |
| Syntax highlighting | `--code-highlight` | `CODE_HIGHLIGHT` | `[build] code_highlight` |
| Copy button | `--code-copy` | `CODE_COPY` | `[build] code_copy` |
| Dark highlight theme | `--code-highlight-theme` | `CODE_HIGHLIGHT_THEME` | `[build] code_highlight_theme` |
| Light highlight theme | `--code-highlight-theme-light` | `CODE_HIGHLIGHT_THEME_LIGHT` | `[build] code_highlight_theme_light` |

## Usage Examples

```bash
# --- Batch Mode (default) ---

# Single file
npx mdsone README.md
npx mdsone README.md -o dist/index.html

# Multiple files → each output to CWD
npx mdsone a.md b.md

# Multiple files → each output to specified directory
npx mdsone a.md b.md -o ./out

# Folder → each .md → corresponding .html (-o directory required)
npx mdsone ./docs -o ./dist

# --- Merge Mode (-m) ---

# Merge multiple files → merge.html output to CWD
npx mdsone intro.md guide.md -m

# Merge multiple files, specify output path
npx mdsone intro.md guide.md -m -o manual.html

# Merge folder → docs.html output to CWD
npx mdsone ./docs -m

# Merge folder, specify output path
npx mdsone ./docs -m -o dist/manual.html --template normal

# Multi-language mode (automatically applies merge logic)
npx mdsone ./docs --i18n-mode --default-locale en -o dist/index.html

# Embed images as base64
npx mdsone ./docs -m -o dist/index.html --img-to-base64 true

# Embed images with resize + compression (requires sharp)
npx mdsone ./docs -m -o dist/index.html --img-to-base64 true --img-max-width 600 --img-compress 90

# Disable syntax highlighting and copy button
npx mdsone ./docs -m -o dist/index.html --code-highlight disable --code-copy disable

# Overwrite protection
npx mdsone README.md -o output.html -f false
```
