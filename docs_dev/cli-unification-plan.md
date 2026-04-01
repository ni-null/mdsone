# CLI / Plugin Unification Plan

Last updated: 2026-04-01

## Scope
- Reduce duplicated logic across `src/cli/main.ts` and `Bun/entry.ts`
- Centralize shared parsing/formatting helpers
- Keep behavior identical while improving maintainability

## Priority Items

1. CLI progress reporter unification (high)
- Current issue:
  - Progress-line state machine is duplicated in:
    - `src/cli/main.ts`
    - `Bun/entry.ts`
  - Duplicated state:
    - `progressStartedAtMs`, `progressLastMessage`, `progressCurrentFile`, ticker lifecycle
  - Duplicated rendering:
    - elapsed-time formatting, batch prefix extraction, filename extraction, color style, line rewrite
- Plan:
  - Create `src/cli/progress-reporter.ts`
  - Expose a factory:
    - `createProgressReporter(options)` returning methods:
      - `onStart(message)`
      - `onUpdate(message)`
      - `onSucceed(message)`
      - `onFail(message)`
      - `onStop()`
      - `teardown()`
  - Make both CLI entrypoints delegate to this module.

2. CLI logging adapter unification (high)
- Current issue:
  - `stripLevelPrefix`, `logInfo`, `logWarn`, `logError` duplicated in both entrypoints.
- Plan:
  - Create `src/cli/logging.ts`
  - Export a logger adapter bound to `createCliRenderer()`.

3. args.ts space-arg validation helper consolidation (medium)
- Current issue:
  - Many `find*SpaceArg` functions with same pattern.
- Plan:
  - Replace with one generic checker:
    - `findInvalidSpaceArg(args, flag, validator)`.

4. Mermaid entity-decode consistency (medium)
- Current issue:
  - Similar decode logic exists in build/runtime sides:
    - `plugins/code-mermaid/index.ts`
    - `plugins/code-mermaid/assets/mermaid-theme-switch.js`
- Plan:
  - Keep one canonical decoder implementation source and derive the other.

5. Generated plugin-assets freshness guard (high)
- Current issue:
  - Runtime may use stale `src/plugins/generated/plugin-assets.ts` when dev assets changed but not regenerated.
- Plan:
  - Ensure `assets:gen` is consistently run in dev/build workflows; optionally add preflight freshness check.

## Suggested Execution Order
1. Progress reporter module
2. Logging adapter module
3. args.ts validator consolidation
4. Mermaid decode consistency
5. plugin-assets freshness guard

