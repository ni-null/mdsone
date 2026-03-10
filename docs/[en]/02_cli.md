# CLI Reference

## Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `--source PATH` | Markdown source (file or directory) | `--source ./README.md` or `--source ./docs` |
| `--output PATH` | Output HTML path | `--output ./dist/index.html` |
| `--output-dir DIR` | Output folder (used together with `--output-filename`) | `--output-dir ./dist` |
| `--output-filename NAME` | Output filename (used together with `--output-dir`) | `--output-filename guide.html` |
| `--template NAME` | Template name | `--template minimal` |
| `--locale CODE` | Locale code (single-language mode) | `--locale en` |
| `--i18n-mode true\|false` | Enable/disable multi-language mode | `--i18n-mode false` |
| `--img-to-base64 true\|false` | Embed images as base64 (local + remote) | `--img-to-base64 true` |
| `--img-max-width PIXELS` | Limit image max width (requires sharp) | `--img-max-width 400` |
| `--img-compress QUALITY` | Image compression quality 1–100 (requires sharp) | `--img-compress 80` |

> `--output` takes priority over the `--output-dir` + `--output-filename` combination.

## Configuration Methods (Priority Order)

Configuration can be specified in three ways, in the following order of priority:

### 1. CLI Arguments (Highest Priority)

```bash
npx mdsone --source ./docs --output ./dist/index.html --i18n-mode false
```

### 2. Environment Variables

```bash
export MARKDOWN_SOURCE_DIR="./docs"
export OUTPUT_FILE="./dist/index.html"
export I18N_MODE="false"
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
markdown_source_dir = "./docs"
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
# Also works for local development
npm start
```

### 4. Default Values

If none of the above are set, built-in default values are used.

## Argument-to-Configuration Mapping

| Feature | CLI Argument | Environment Variable | config.toml |
|---------|-------------|----------------------|-------------|
| Markdown source | `--source` | `MARKDOWN_SOURCE_DIR` | `[paths] markdown_source_dir` |
| Output path | `--output` | `OUTPUT_FILE` | `[paths] output_file` |
| Output folder | `--output-dir` | `OUTPUT_DIR` | `[paths] output_dir` |
| Output filename | `--output-filename` | `OUTPUT_FILENAME` | `[paths] output_filename` |
| Template | `--template` | `DEFAULT_TEMPLATE` | `[build] default_template` |
| Locale | `--locale` | `LOCALE` | `[i18n] locale` |
| Multi-language mode | `--i18n-mode` | `I18N_MODE` | `[i18n] mode` |
| Default locale | — | `DEFAULT_LOCALE` | `[i18n] default_locale` |
| Page title | — | `SITE_TITLE` | `[site] title` |
| Theme | — | `THEME_MODE` | `[site] theme_mode` |
| Minify HTML | — | `MINIFY_HTML` | `[build] minify_html` |
| Build date | — | `BUILD_DATE` | `[build] build_date` |
| Image base64 embed | `--img-to-base64` | `IMG_TO_BASE64` | `[build] img_to_base64` |
| Image max width | `--img-max-width` | `IMG_MAX_WIDTH` | `[build] img_max_width` |
| Image compression quality | `--img-compress` | `IMG_COMPRESS` | `[build] img_compress` |

## Usage Examples

### Local Development (using config.toml)

```bash
# Reads config.toml settings by default
npx mdsone

# CLI arguments override config.toml
npx mdsone --source ./custom-docs --output ./dist/index.html
```

### CI Environment (using environment variables)

```yaml
env:
  MARKDOWN_SOURCE_DIR: "./docs"
  OUTPUT_FILE: "./docs/index.html"
  I18N_MODE: "true"
  DEFAULT_LOCALE: "en"
  IMG_TO_BASE64: "true"
  IMG_MAX_WIDTH: "600"
  IMG_COMPRESS: "90"
steps:
  - run: npm ci
  - run: npx mdsone
```

### Quick Testing

```bash
# Disable multi-language mode, specify source and output
npx mdsone --source ./test --output ./test/output.html --i18n-mode false

# Enable multi-language with normal template
npx mdsone --source ./docs --output ./dist/index.html --template normal --i18n-mode true

# Embed images as base64 (no resize)
npx mdsone --source ./docs --output ./dist/index.html --img-to-base64 true

# Embed images with resize + compression (requires sharp)
npx mdsone --source ./docs --output ./dist/index.html --img-to-base64 true --img-max-width 600 --img-compress 90
```
