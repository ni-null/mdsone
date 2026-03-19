// ============================================================
// src/plugins/manager.ts
// Plugin manager: order, HTML post-processing, and asset aggregation.
// ============================================================

import { load } from "cheerio";
import type { Config, Plugin, PluginContext } from "../core/types.js";
import { builtInPlugins } from "./index.js";

/**
 * Sort plugins by `config.plugins.order`.
 * Unspecified plugins keep relative order and are placed after specified ones.
 */
function sortPlugins(plugins: Plugin[], order: string[] | undefined): Plugin[] {
  if (!order || order.length === 0) return plugins;
  const priority = new Map(order.map((name, i) => [name, i]));
  return [...plugins].sort((a, b) => {
    const pa = priority.has(a.name) ? priority.get(a.name)! : Number.POSITIVE_INFINITY;
    const pb = priority.has(b.name) ? priority.get(b.name)! : Number.POSITIVE_INFINITY;
    if (pa === pb) return 0;
    return pa - pb;
  });
}

function sortOutputPlugins(plugins: Plugin[]): Plugin[] {
  const normal = plugins.filter((p) => p.name !== "minify");
  const tail = plugins.filter((p) => p.name === "minify");
  return [...normal, ...tail];
}

export class PluginManager {
  private readonly plugins: readonly Plugin[];

  constructor(plugins?: Plugin[]) {
    this.plugins = plugins ?? builtInPlugins;
  }

  /**
   * Run enabled plugins' `extendMarkdown()` in order.
   * Failures are logged and do not stop remaining plugins.
   */
  extendMarkdown(
    markdownIt: unknown,
    config: Config,
    context: PluginContext,
  ): void {
    const ordered = sortPlugins(
      [...this.plugins],
      (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
    );
    for (const plugin of ordered) {
      if (!plugin.isEnabled(config) || !plugin.extendMarkdown) continue;
      try {
        plugin.extendMarkdown(markdownIt, config, context);
      } catch (e) {
        console.warn(
          `[WARN] Plugin "${plugin.name}" extendMarkdown failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }

  /**
   * Run enabled plugins' `processDom()` in order on a shared DOM tree.
   * Failures are logged and do not stop remaining plugins.
   */
  async processHtml(
    html: string,
    config: Config,
    context: PluginContext,
  ): Promise<string> {
    const ordered = sortPlugins(
      [...this.plugins],
      (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
    );

    const enabled = ordered.filter((plugin) => plugin.isEnabled(config) && plugin.processDom);
    if (enabled.length === 0) return html;
    const dom = load(html, {}, false);
    for (const plugin of enabled) {
      try {
        await plugin.processDom!(dom as unknown, config, context);
      } catch (e) {
        console.warn(
          `[WARN] Plugin "${plugin.name}" processDom failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    const serialized = dom.html();
    return serialized || html;
  }

  /**
   * Run enabled plugins' `processOutputHtml()` in order.
   * This hook is applied to full-page HTML after buildHtml().
   * `minify` plugin is always forced to run last.
   */
  async processOutputHtml(
    html: string,
    config: Config,
  ): Promise<string> {
    let result = html;
    const ordered = sortOutputPlugins(
      sortPlugins(
        [...this.plugins],
        (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
      ),
    );
    for (const plugin of ordered) {
      if (plugin.isEnabled(config) && plugin.processOutputHtml) {
        try {
          result = await plugin.processOutputHtml(result, config);
        } catch (e) {
          console.warn(
            `[WARN] Plugin "${plugin.name}" processOutputHtml failed: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }
    return result;
  }

  /**
   * Collect plugin assets and merge to a single `{ css, js }` payload.
   * Failures are logged and do not stop the remaining plugins.
   */
  async getAssets(config: Config): Promise<{ css: string; js: string }> {
    const cssParts: string[] = [];
    const jsParts: string[] = [];

    const ordered = sortPlugins(
      [...this.plugins],
      (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
    );
    for (const plugin of ordered) {
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
   * Collect validation messages from enabled plugins.
   */
  validateConfig(config: Config): string[] {
    return this.plugins
      .filter((p) => p.isEnabled(config) && p.validateConfig)
      .flatMap((p) => p.validateConfig!(config));
  }
}
