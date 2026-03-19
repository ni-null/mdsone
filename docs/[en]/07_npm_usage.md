# NPM Usage

`mdsone` can be used as a library, not only as a CLI tool.

## Install

```bash
npm install mdsone
```

## Public Entry Points

- `mdsone/core` - core conversion/build functions
- `mdsone/node` - Node I/O adapters (template/file loading)
- `mdsone/plugins/*` - plugin-specific APIs

Available plugin subpaths:

- `mdsone/plugins/shiki`
- `mdsone/plugins/katex`
- `mdsone/plugins/copy`
- `mdsone/plugins/line-number`
- `mdsone/plugins/image` (Node-oriented)
- `mdsone/plugins/minify`

## Core + Node Example

```ts
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_CONFIG,
  markdownToHtml,
  buildHtml,
  getAllTemplateStrings,
} from "mdsone/core";
import { loadTemplateFiles, loadLocaleFile } from "mdsone/node";

const mdText = await readFile("./README.md", "utf8");
const templateRoot = path.resolve("./templates");
const templateName = "normal";
const localeRoot = path.resolve("./locales");

const templateData = await loadTemplateFiles(templateRoot, templateName);
const localeFile = await loadLocaleFile(localeRoot, "en");

const bodyHtml = markdownToHtml(mdText, DEFAULT_CONFIG.markdown_extensions, 0);

const html = buildHtml({
  config: {
    ...DEFAULT_CONFIG,
    default_template: templateName,
    template_variant: "default",
    site_title: "My Docs",
    i18n_mode: false,
  },
  templateData,
  documents: { index: bodyHtml },
  i18nStrings: getAllTemplateStrings(localeFile, "2026.03.19"),
});

await writeFile("./output.html", html, "utf8");
```

## Compose Plugins Manually

```ts
import { markdownToHtml, DEFAULT_CONFIG } from "mdsone/core";
import { shiki, shikiAssets } from "mdsone/plugins/shiki";
import { copy, copyAssets } from "mdsone/plugins/copy";
import { lineNumber, lineNumberAssets } from "mdsone/plugins/line-number";

let result = markdownToHtml("```bash\nnpx mdsone\n```", DEFAULT_CONFIG.markdown_extensions, 0);
result = await shiki(result);
result = await copy(result, { mode: "line" });
result = await lineNumber(result);

const shikiLib = await shikiAssets();
const copyLib = await copyAssets({ mode: "line" });
const lnLib = await lineNumberAssets();

const libCss = `${shikiLib.css ?? ""}\n${copyLib.css ?? ""}\n${lnLib.css ?? ""}`;
const libJs = `${copyLib.js ?? ""}\n${lnLib.js ?? ""}`;
```

## Browser Use

- `mdsone/core` can be used in browser-side markdown rendering flows.
- `mdsone/node` is Node-only.
- `image` plugin is designed for Node file/network processing.
- Other plugins can be composed as HTML post-processors when needed.