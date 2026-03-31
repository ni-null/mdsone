// ============================================================
// src/plugins/index.ts — Built-in plugin registry
// ============================================================

import type { Plugin } from "../core/types.js";
import { katexPlugin } from "../../plugins/katex/index.js";
import { codeHighlightPlugin } from "../../plugins/code-highlight/index.js";
import { codeMermaidPlugin } from "../../plugins/code-mermaid/index.js";
import { codeCopyPlugin } from "../../plugins/code-copy/index.js";
import { imageEmbedPlugin } from "../../plugins/image/index.js";
import { codeLineNumberPlugin } from "../../plugins/code-line-number/index.js";
import { minifyPlugin } from "../../plugins/minify/index.js";

/**
 * Built-in plugins (execution order is handled by PluginManager).
 */
export const builtInPlugins: Plugin[] = [
  imageEmbedPlugin,
  katexPlugin,
  codeMermaidPlugin,
  codeHighlightPlugin,
  codeCopyPlugin,
  codeLineNumberPlugin,
  minifyPlugin,
];
