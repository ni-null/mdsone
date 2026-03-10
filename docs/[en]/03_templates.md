# Templates

## Built-in Templates

| Name | Description |
|------|-------------|
| `normal` | Sidebar + TOC + light/dark mode toggle |
| `minimal` | Clean layout, ideal for lightweight documents |

```bash
npx mdsone --template normal
npx mdsone --template minimal
```

## Template Structure

```
templates/
└── my-template/
    ├── template.html
    ├── style.css
    └── template.config.json
```

## template.config.json

```json
{
  "toc": { "enabled": true, "levels": [2, 3] },
  "extra_css_urls": ["https://cdn.example.com/style.css"],
  "extra_css_inline": ["custom.css"],
  "extra_js_urls": ["https://cdn.example.com/lib.js"],
  "extra_js_inline": ["analytics.js"]
}
```

| Field | Description |
|-------|-------------|
| `toc.enabled` | Whether to display the table of contents |
| `toc.levels` | Heading levels to include in TOC, e.g. `[2, 3]` means h2 and h3 |
| `extra_css_urls` | CDN CSS, injected as `<link>` tags |
| `extra_css_inline` | Local CSS (relative to the template folder), inlined as `<style>` |
| `extra_js_urls` | CDN JS, injected as `<script src>` tags |
| `extra_js_inline` | Local JS, inlined as `<script>` |

## Adding a Custom Template

```bash
# Windows PowerShell
Copy-Item -Recurse templates/minimal templates/my-template

# macOS / Linux
cp -r templates/minimal templates/my-template

# Run with the custom template
npx mdsone --template my-template
```

## template.html Placeholders

| Placeholder | Replaced With |
|-------------|---------------|
| `{TITLE}` | Page title |
| `{LANG}` | HTML lang attribute |
| `{CSS_CONTENT}` | style.css content |
| `{EXTRA_CSS}` | Additional CSS tags |
| `{EXTRA_JS}` | Additional JS tags |
| `{MDSONE_DATA_SCRIPT}` | Document data JSON (`window.mdsone_DATA` event) |
