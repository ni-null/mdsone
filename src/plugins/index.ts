// ============================================================
// src/plugins/index.ts — Built-in plugin registry
// ============================================================

import type { Plugin } from "../core/types.js";
import { katexPlugin } from "../../plugins/katex/index.js";
import { shikiPlugin } from "../../plugins/shiki/index.js";
import { copyPlugin } from "../../plugins/copy/index.js";
import { imageEmbedPlugin } from "../../plugins/image/index.js";
import { lineNumberPlugin } from "../../plugins/line-number/index.js";
import { minifyPlugin } from "../../plugins/minify/index.js";

/**
 * Built-in plugins (execution order is handled by PluginManager).
 */
export const builtInPlugins: Plugin[] = [
  imageEmbedPlugin,
  katexPlugin,
  shikiPlugin,
  copyPlugin,
  lineNumberPlugin,
  minifyPlugin,
];
