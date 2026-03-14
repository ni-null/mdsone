// ============================================================
// plugins/copy/index.ts — 複製按鈕 Plugin
// ============================================================

import type { Plugin, PluginAssets } from "../../src/core/types.js";
import { getCopyButtonScript } from "./copy-button.js";

export const copyPlugin: Plugin = {
    name: "copy",

    isEnabled: (config) => config.code_copy,

    getAssets(_config): PluginAssets {
        const script = getCopyButtonScript();
        return {
            js:
                `<script>\n` +
                `try {\n` +
                script + `\n` +
                `} catch(e) {\n` +
                `  console.warn('[mdsone] Failed to load copy button:', e.message);\n` +
                `}\n` +
                `</script>`,
        };
    },
};
