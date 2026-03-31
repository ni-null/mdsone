// ============================================================
// src/plugins/manager.ts
// Plugin manager: order, HTML post-processing, and asset aggregation.
// ============================================================

import { load } from "cheerio";
import type { Config, Plugin, PluginContext, ValidationIssue } from "../core/types.js";
import { builtInPlugins } from "./index.js";
import { listPluginAssets, resolvePluginAsset, type PluginAssetKind } from "./asset-registry.js";

export type PluginProgressHook = (
  phase: "assets" | "extend-markdown" | "process-dom" | "process-output",
  pluginName: string,
) => void;

function wrapCssAssetTag(assetPath: string, content: string): string {
  return `<style>/* ${assetPath} */\n${content}\n</style>`;
}

function wrapJsAssetTag(assetPath: string, content: string): string {
  return `<script>/* ${assetPath} */\n${content}\n</script>`;
}

function collectFileAssets(
  target: string[],
  pluginName: string,
  kind: PluginAssetKind,
  filePaths: string[] | undefined,
): void {
  for (const filePath of filePaths ?? []) {
    const resolved = resolvePluginAsset(pluginName, kind, filePath);
    if (!resolved) {
      console.warn(`[WARN] Plugin "${pluginName}" ${kind} asset not found: ${filePath}`);
      continue;
    }

    if (kind === "css") {
      target.push(wrapCssAssetTag(resolved.assetPath, resolved.content));
    } else {
      target.push(wrapJsAssetTag(resolved.assetPath, resolved.content));
    }
  }
}

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
  async extendMarkdown(
    markdownIt: unknown,
    config: Config,
    context: PluginContext,
    progressHook?: PluginProgressHook,
  ): Promise<void> {
    const ordered = sortPlugins(
      [...this.plugins],
      (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
    );
    for (const plugin of ordered) {
      if (!plugin.isEnabled(config) || !plugin.extendMarkdown) continue;
      progressHook?.("extend-markdown", plugin.name);
      try {
        await plugin.extendMarkdown(markdownIt, config, context);
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
    progressHook?: PluginProgressHook,
  ): Promise<string> {
    const ordered = sortPlugins(
      [...this.plugins],
      (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
    );

    const enabled = ordered.filter((plugin) => plugin.isEnabled(config) && plugin.processDom);
    if (enabled.length === 0) return html;
    const dom = load(html, {}, false);
    for (const plugin of enabled) {
      progressHook?.("process-dom", plugin.name);
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
    progressHook?: PluginProgressHook,
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
        progressHook?.("process-output", plugin.name);
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
  async getAssets(
    config: Config,
    progressHook?: PluginProgressHook,
  ): Promise<{ css: string; js: string }> {
    const cssParts: string[] = [];
    const jsParts: string[] = [];

    const ordered = sortPlugins(
      [...this.plugins],
      (config as unknown as { plugins?: { order?: string[] } }).plugins?.order,
    );
    for (const plugin of ordered) {
      if (!plugin.isEnabled(config)) continue;
      progressHook?.("assets", plugin.name);

      try {
        // Default mode: when plugin does not implement getAssets(), load all assets/*
        // from generated registry/filesystem by plugin name.
        if (!plugin.getAssets) {
          collectFileAssets(cssParts, plugin.name, "css", listPluginAssets(plugin.name, "css"));
          collectFileAssets(jsParts, plugin.name, "js", listPluginAssets(plugin.name, "js"));
          continue;
        }

        const assets = await plugin.getAssets(config);
        collectFileAssets(cssParts, plugin.name, "css", assets.cssFiles);
        collectFileAssets(jsParts, plugin.name, "js", assets.jsFiles);
      } catch (e) {
        console.warn(
          `[WARN] Plugin "${plugin.name}" getAssets failed: ${e instanceof Error ? e.message : e}`,
        );
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
  validateConfig(config: Config): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const plugin of this.plugins) {
      if (!plugin.isEnabled(config) || !plugin.validateConfig) continue;
      let rawIssues: Array<string | ValidationIssue>;
      try {
        rawIssues = plugin.validateConfig(config);
      } catch (e) {
        issues.push({
          level: "error",
          code: "plugin.validate.crash",
          plugin: plugin.name,
          message: `Plugin "${plugin.name}" validateConfig crashed: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }

      for (const issue of rawIssues) {
        if (typeof issue === "string") {
          issues.push({
            level: "error",
            plugin: plugin.name,
            message: issue,
          });
          continue;
        }
        issues.push({
          level: issue.level ?? "error",
          plugin: issue.plugin ?? plugin.name,
          code: issue.code,
          hint: issue.hint,
          message: issue.message,
        });
      }
    }
    return issues;
  }
}
