# Templates

## Built-in Templates

| Name      | Description                              |
| --------- | ---------------------------------------- |
| `normal`  | Sidebar + TOC + light/dark mode toggle   |
| `minimal` | Clean layout, suitable for lightweight docs |

```bash
npx mdsone --template normal
npx mdsone --template minimal
```

## Code Highlight Themes

Code highlighting is performed **at build time** (server-side), not at browser runtime. This means:

- ✅ No need to embed highlight.js in the output HTML (saves ~120KB of JavaScript)
- ✅ No risk of runtime errors
- ✅ Faster page load speed

### Available Themes

highlight.js provides **100+ official themes** from its npm package. The default dark/light theme pair is:

- **Dark** (default): `atom-one-dark`
- **Light** (default): `atom-one-light`

### Custom Themes

Specify any theme name via CLI arguments or config.toml:

**Via CLI:**

```bash
# Use GitHub Dark and GitHub Light themes
npx mdsone --code-highlight-theme github-dark --code-highlight-theme-light github

# Or change only the dark theme
npx mdsone --code-highlight-theme nord
```

**Via config.toml:**

```toml
[build]
code_highlight_theme       = "github-dark"
code_highlight_theme_light = "github"
```

### Popular Themes

| Dark               | Light               | Description          |
| ------------------ | ------------------- | -------------------- |
| `atom-one-dark`    | `atom-one-light`    | GitHub Atom colors   |
| `github-dark`      | `github`            | GitHub Light/Dark    |
| `vs2015`           | `vs`                | Visual Studio        |
| `monokai`          | `xcode`             | Sublime Text / Xcode |
| `nord`             | `nord`              | Nordic color scheme  |
| `tokyo-night-dark` | `tokyo-night-light` | Tokyo Night          |
| `rose-pine`        | `rose-pine-dawn`    | Rose Pine            |

For the full list of themes, see the [highlight.js official themes](https://highlightjs.org/download/).

## Template Structure

```
templates/
└── my-template/
    ├── template.html
    ├── style.css
    ├── template.config.json
    └── assets/
        ├── example1.css      # Auto-scanned and injected
        └── example2.js       # Sorted by numeric prefix
```

### assets/ Folder

CSS/JS files in `assets/` are automatically scanned and inline-injected into the template — no need to list them explicitly in `template.config.json`:

- **CSS files** → injected as `<style>` inside `<head>`
- **JS files** → injected as `<script>` before `</body>`
- **Sort order** → files are sorted by numeric prefix (e.g. `01_base.css`, `02_theme.css`)

This is the simplest way to handle template-specific styles and logic.

## template.config.json

```json
{
  "_metadata": {
    "version": "1.0.0",
    "schema_version": "v1"
  },
  "toc": {
    "enabled": true,
    "levels": [2, 3]
  }
}
```

| Field                      | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `_metadata.version`        | Template version (informational)                   |
| `_metadata.schema_version` | Template config format version                     |
| `toc.enabled`              | Whether to display the table of contents           |
| `toc.levels`               | TOC heading levels, e.g. `[2, 3]` means h2 and h3 |

> Additional CSS/JS can be placed in the `assets/` folder for auto-scanning, or specified as external URLs via `--extra-css` / `--extra-js` in CLI, environment variables, or config.toml.

## Adding a Custom Template

```bash
# Windows PowerShell
Copy-Item -Recurse templates/minimal templates/my-template

# macOS / Linux
cp -r templates/minimal templates/my-template

# Edit template files
cd templates/my-template
# Edit template.html, style.css, locales, etc.

# Run with custom template
npx mdsone --template my-template

# Or specify in config.toml
# [build]
# default_template = "my-template"
```

## template.html Placeholders

| Placeholder            | Replaced With                                              |
| ---------------------- | ---------------------------------------------------------- |
| `{TITLE}`              | Page title                                                 |
| `{LANG}`               | HTML lang attribute                                        |
| `{CSS_CONTENT}`        | style.css contents                                         |
| `{LIB_CSS}`            | Styles from the lib/ folder (highlight.js themes)          |
| `{EXTRA_CSS}`          | Extra CSS tags                                             |
| `{LIB_JS}`             | Scripts from the lib/ folder (highlight.js and copy button)|
| `{EXTRA_JS}`           | Extra JS tags                                              |
| `{MDSONE_DATA_SCRIPT}` | Document data JSON (window.mdsone_DATA event)              |

### lib/ Folder

`lib/` stores code files for optional features:

```
lib/
├── highlight/
│   ├── highlight.min.js       # highlight.js syntax highlighting engine
│   └── css/
│       ├── atom-one-dark.min.css    # Dark theme
│       └── atom-one-light.min.css   # Light theme
└── copy/
    └── copy.js                # Code copy button functionality
```

Based on the `--code-highlight` and `--code-copy` flags, the corresponding files are inline-injected into `{LIB_CSS}` and `{LIB_JS}`. Users can dynamically enable or disable these features via arguments.
