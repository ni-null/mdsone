# Templates

## Built-in Template

Current built-in template:

- `normal`

```bash
npx mdsone ./docs -m --template normal
```

## Template Variant

`--template` supports this form:

```text
<theme-or-path>[@variant]
```

Examples:

```bash
npx mdsone ./docs -m --template normal@default
npx mdsone ./docs -m --template normal@warm-cream
npx mdsone ./docs -m --template C:\themes\dark-doc@ocean
```

If variant is missing or not found, runtime falls back to `default`.

## template.config.json

Template runtime settings are defined in `template.config.json`.

```json
{
  "_metadata": {
    "name": "normal",
    "version": "1.1.0",
    "schema_version": "v1"
  },
  "config": {
    "palette": "fog-gray",
    "types": {
      "default": {
        "code": {
          "Shiki": {
            "dark": "github-dark",
            "light": "github-light",
            "auto_detect": true
          }
        }
      }
    }
  }
}
```

Key fields:

- `config.palette`: default palette key
- `config.types`: variant map
- `config.types.<name>.code.Shiki.dark/light/auto_detect`: Shiki theme settings by variant

## Template Structure

```text
templates/
  my-template/
    template.html
    style.css
    template.config.json
    locales/
      en.json
      zh-TW.json
    assets/
      01_base.css
      02_behavior.js
```

## assets/ Injection

Files in `assets/` are inlined automatically:

- `.css` -> injected into `<head>` as `<style>`
- `.js` -> injected before `</body>` as `<script>`
- sorted by filename

## template.html Placeholders

| Placeholder | Replaced with |
|---|---|
| `{TITLE}` | Page title |
| `{LANG}` | HTML `lang` attribute |
| `{CSS_CONTENT}` | `style.css` content |
| `{LIB_CSS}` | Plugin CSS bundle |
| `{EXTRA_CSS}` | Inlined extra CSS from `assets/` |
| `{LIB_JS}` | Plugin JS bundle |
| `{EXTRA_JS}` | Inlined extra JS from `assets/` |
| `{MDSONE_DATA_SCRIPT}` | `window.mdsone_DATA` payload |

## Custom Template Quick Start

```bash
# PowerShell
Copy-Item -Recurse templates/normal templates/my-template

# Use custom template
npx mdsone ./docs -m --template my-template
```