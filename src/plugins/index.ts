// ============================================================
// src/plugins/index.ts — Built-in plugin registry
// ============================================================

import type { Plugin } from "../core/types.js";
import { highlightPlugin } from "../../plugins/highlight/index.js";
import { copyPlugin } from "../../plugins/copy/index.js";
import { imageEmbedPlugin } from "../../plugins/image/index.js";
import { lineNumberPlugin } from "../../plugins/line-number/index.js";

/**
 * Built-in plugins (execution order is handled by PluginManager).
 */
export const builtInPlugins: Plugin[] = [
  imageEmbedPlugin,
  highlightPlugin,
  copyPlugin,
  lineNumberPlugin,
];
