# Developer Notes

This page summarizes the current architecture used by `mdsone`.

## Layering

- Core (`mdsone/core`): markdown render/build primitives, no direct file I/O.
- Node adapter (`mdsone/node`): config loading, filesystem access, template/locale file loading.
- Plugins (`plugins/*`): feature modules registered through `PluginManager`.

## Plugin Hook Stages

- `extendMarkdown(md, config, context)`
  - Runs before markdown rendering.
  - Example: `katex` registers `markdown-it-katex`.

- `processDom(dom, config, context)`
  - Runs after markdown HTML is produced.
  - Uses a shared DOM instance (Cheerio) for ordered post-processing.

- `getAssets(config)`
  - Returns inline CSS/JS snippets for final HTML injection.

- `processOutputHtml(html, config)`
  - Runs on final full-page HTML.
  - Example: `minify` plugin.

## Current Built-in Plugins

- `image` -> base64 embedding and optional resize/compress
- `katex` -> markdown formula support + conditional CSS/font injection
- `shiki` -> syntax highlighting
- `copy` -> copy button behavior
- `line_number` -> line number rendering
- `minify` -> final HTML minification

## Template Contract

Expected files:

```text
templates/<name>/
  template.html
  style.css
  template.config.json
  locales/*.json     # optional
  assets/*           # optional
```

`template.html` placeholder contract:

- `{TITLE}`
- `{LANG}`
- `{CSS_CONTENT}`
- `{LIB_CSS}`
- `{EXTRA_CSS}`
- `{LIB_JS}`
- `{EXTRA_JS}`
- `{MDSONE_DATA_SCRIPT}`

## Guidance

- Keep plugin features inside plugin modules.
- Keep core focused on orchestration and generic contracts.
- Add new plugin CLI flags via `plugin.registerCli()` and `plugin.cliToConfig()`.
- Prefer updating docs whenever CLI/plugin behavior changes.
- Keep output-stage assets conditional when possible (for example, KaTeX injects CSS only when formulas are rendered).
