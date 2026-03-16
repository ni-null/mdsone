// ============================================================
// src/plugin-manager.ts — Plugin 管理器
// 負責按順序執行各 plugin，收集 HTML 資源統一注入
// ============================================================

import type { Config, Plugin, PluginContext } from "./core/types.js";
import { highlightPlugin } from "../plugins/highlight/index.js";
import { copyPlugin } from "../plugins/copy/index.js";
import { imageEmbedPlugin } from "../plugins/image/index.js";

/**
 * 內建 plugin 清單（順序即執行順序）。
 * image 必須在 highlight 之前，因為會修改 img 標籤結構。
 */
const builtInPlugins: Plugin[] = [
    imageEmbedPlugin,
    highlightPlugin,
    copyPlugin,
];

export class PluginManager {
    private readonly plugins: readonly Plugin[];

    constructor(plugins?: Plugin[]) {
        this.plugins = plugins ?? builtInPlugins;
    }

    /**
     * 按順序執行所有啟用 plugin 的 processHtml()。
     * 單一 plugin 失敗只印 WARN，不中止其餘處理。
     */
    async processHtml(
        html: string,
        config: Config,
        context: PluginContext,
    ): Promise<string> {
        let result = html;
        for (const plugin of this.plugins) {
            if (plugin.isEnabled(config) && plugin.processHtml) {
                try {
                    result = await plugin.processHtml(result, config, context);
                } catch (e) {
                    console.warn(
                        `[WARN] Plugin "${plugin.name}" processHtml failed: ${e instanceof Error ? e.message : e}`,
                    );
                }
            }
        }
        return result;
    }

    /**
     * 收集所有啟用 plugin 的靜態資源，合併為 { css, js }。
     * 單一 plugin 失敗只印 WARN，不中止其餘收集。
     */
    async getAssets(config: Config): Promise<{ css: string; js: string }> {
        const cssParts: string[] = [];
        const jsParts: string[] = [];

        for (const plugin of this.plugins) {
            if (plugin.isEnabled(config) && plugin.getAssets) {
                try {
                    const assets = await plugin.getAssets(config);
                    if (assets.css) cssParts.push(assets.css);
                    if (assets.js) jsParts.push(assets.js);
                } catch (e) {
                    console.warn(
                        `[WARN] Plugin "${plugin.name}" getAssets failed: ${e instanceof Error ? e.message : e}`,
                    );
                }
            }
        }

        return {
            css: cssParts.join("\n"),
            js: jsParts.join("\n"),
        };
    }

    /**
     * 執行所有啟用 plugin 的 validateConfig()，收集所有錯誤。
     */
    validateConfig(config: Config): string[] {
        return this.plugins
            .filter((p) => p.isEnabled(config) && p.validateConfig)
            .flatMap((p) => p.validateConfig!(config));
    }
}
