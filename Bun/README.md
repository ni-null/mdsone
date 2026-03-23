# Bun Exe Build

This folder contains the Bun-specific executable build flow for `mdsone`.

## Build

```bash
bun run Bun/build.mjs
```

Optional environment variables:

- `BUN_COMPILE_MINIFY=1`

## Output

Build artifacts are written to:

- `Bun/dist/mdsone-win-x64.exe`
- `Bun/dist/mdsone-linux-x64`
- `Bun/dist/mdsone-macos-x64`
- `Bun/dist/mdsone-macos-arm64`

During build, `Bun/build.mjs` generates:

- `Bun/generated/embedded-assets.ts`

The generated file statically embeds:

- `templates/**`
- `locales/**`
- `node_modules/katex/dist/katex.min.css`
- `node_modules/katex/dist/fonts/**` (if present)

At runtime, the executable extracts embedded assets to a temp directory and
sets:

- `TEMPLATES_DIR`
- `LOCALES_DIR`
- `KATEX_DIST_DIR` (when KaTeX assets are embedded)

No external runtime folder is required in distribution.

Windows executable icon source:

- `logo/mdsone.ico`
