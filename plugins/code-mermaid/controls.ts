// ============================================================
// plugins/code-mermaid/controls.ts
// Mermaid control markup in one dedicated module.
// ============================================================

const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const RESET_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 3 3 9 9 9"></polyline></svg>';
const FULLSCREEN_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';

export function buildMermaidControlsHtml(): string {
  return [
    '  <div class="mdsone-mermaid__controls" role="group" aria-label="Mermaid controls">',
    `    <button type="button" class="mdsone-mermaid__btn mdsone-mermaid__copy-btn" data-copy="mermaid" aria-label="Copy Mermaid code" title="Copy Mermaid code">${COPY_ICON}</button>`,
    '    <div class="mdsone-mermaid__control-panel mdsone-mermaid__control-panel--bottom">',
    `      <button type="button" class="mdsone-mermaid__btn mdsone-mermaid__fullscreen-btn" data-view="fullscreen" aria-label="Toggle fullscreen" title="Toggle fullscreen">${FULLSCREEN_ICON}</button>`,
    '      <button type="button" class="mdsone-mermaid__btn mdsone-mermaid__zoom-btn mdsone-mermaid__cell-zoom-in" data-zoom="in" aria-label="Zoom in" title="Zoom in">+</button>',
    `      <button type="button" class="mdsone-mermaid__btn mdsone-mermaid__reset-btn" data-view="reset" aria-label="Reset view" title="Reset view">${RESET_ICON}</button>`,
    '      <button type="button" class="mdsone-mermaid__btn mdsone-mermaid__zoom-btn mdsone-mermaid__cell-zoom-out" data-zoom="out" aria-label="Zoom out" title="Zoom out">-</button>',
    "    </div>",
  "  </div>",
  ].join("\n");
}
