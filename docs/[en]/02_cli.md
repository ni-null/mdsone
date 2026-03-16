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
| `--img-base64-embed true\|false` | Embed images as base64 (local + remote) | `--img-base64-embed true` |
| `--img-max-width PIXELS` | Limit maximum image width (requires sharp) | `--img-max-width 400` |
| `--img-compress QUALITY` | Image compression quality 1–100 (requires sharp) | `--img-compress 80` |
| `--code-highlight enable\|disable` | Syntax highlighting (default: enable) | `--code-highlight disable` |
| `--code-copy enable\|disable` | Code copy button (default: enable) | `--code-copy disable` |
| `--code-highlight-theme NAME` | highlight.js dark theme name | `--code-highlight-theme github-dark` |
| `--code-highlight-theme-light NAME` | highlight.js light theme name | `--code-highlight-theme-light github` |
| `--config PATH` | Specify config.toml path | `--config ./config.toml` |
| `--no-config` | Ignore config.toml | `--no-config` |

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
mdsone ./docs --i18n-mode --i18n-default en -o dist/index.html
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

[plugins]
image = { base64_embed = true, max_width = 600, compress = 90 }

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
| Templates dir | — | `TEMPLATES_DIR` | `[paths] templates_dir` |
| Merge mode | `-m, --merge` | — | — |
| Template | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template` |
| Locale | `--locale` | `LOCALE` | `[i18n] locale` |
| Multi-language mode | `--i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| Default locale | `--i18n-default` | `DEFAULT_LOCALE` | `[i18n] default_locale` |
| Page title | `--site-title` | `SITE_TITLE` | `[site] title` |
| Theme | `--theme-mode` | `THEME_MODE` | `[site] theme_mode` |
| Minify HTML | `--minify-html` | `MINIFY_HTML` | `[build] minify_html` |
| Build date | — | `BUILD_DATE` | `[build] build_date` |
| Markdown extensions | — | `MARKDOWN_EXTENSIONS` | `[build] markdown_extensions` |
| Image base64 embed | `--img-base64-embed` | `IMG_TO_BASE64` | `[plugins.image] base64_embed` |
| Image max width | `--img-max-width` | `IMG_MAX_WIDTH` | `[plugins.image] max_width` |
| Image compression quality | `--img-compress` | `IMG_COMPRESS` | `[plugins.image] compress` |
| Syntax highlighting | `--code-highlight` | `CODE_HIGHLIGHT` | `[plugins.highlight] enable` |
| Copy button | `--code-copy` | `CODE_COPY` | `[plugins.copy] enable` |
| Dark highlight theme | `--code-highlight-theme` | `CODE_HIGHLIGHT_THEME` | `[plugins.highlight] theme` |
| Light highlight theme | `--code-highlight-theme-light` | `CODE_HIGHLIGHT_THEME_LIGHT` | `[plugins.highlight] theme_light` |

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
npx mdsone ./docs --i18n-mode --i18n-default en -o dist/index.html

# Embed images as base64
npx mdsone ./docs -m -o dist/index.html --img-base64-embed true

# Embed images with resize + compression (requires sharp)
npx mdsone ./docs -m -o dist/index.html --img-base64-embed true --img-max-width 600 --img-compress 90

# Disable syntax highlighting and copy button
npx mdsone ./docs -m -o dist/index.html --code-highlight disable --code-copy disable

# Overwrite protection
npx mdsone README.md -o output.html -f false
```


