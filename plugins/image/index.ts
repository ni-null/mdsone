// ============================================================
// plugins/image/index.ts — 圖片嵌入 base64 Plugin
//
// 將 HTML 中的 <img src="..."> 轉換為 base64 data URL：
//   - 本地路徑（相對 / 絕對）：讀取檔案
//   - 遠端 URL（http / https）：fetch 後轉 base64
//   - 已是 data: URL：跳過
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import type { Config, Plugin, PluginAssets } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { fetchRemoteImage, MIME_MAP } from "./fetch-image.js";
import { processImageBuffer } from "./process-image.js";

type ImageEmbedMode = "off" | "base64";
type ImagePluginConfig = {
    embed?: unknown;
    base64_embed?: unknown;
    max_width?: unknown;
    compress?: unknown;
};

async function embedImagesInHtml(
    html: string,
    baseDir: string,
    opts: { maxWidth?: number; compress?: number } = {},
): Promise<string> {
    const imgPattern = /<img([^>]*)\ssrc=(['"])([^'"]+)\2([^>]*)>/gi;
    const replacements: Array<{ original: string; replaced: string }> = [];

    let match: RegExpExecArray | null;
    while ((match = imgPattern.exec(html)) !== null) {
        const [full, before, , src, after] = match;
        if (/^data:/i.test(src)) continue;

        let imageData: { buffer: Buffer; mime: string } | null = null;

        if (/^https?:/i.test(src)) {
            imageData = await fetchRemoteImage(src);
            if (!imageData) {
                console.warn(`[WARN] Failed to fetch remote image: ${src}`);
                continue;
            }
        } else {
            const absPath = path.isAbsolute(src) ? src : path.resolve(baseDir, src);
            const ext = path.extname(absPath).toLowerCase();
            const mime = MIME_MAP[ext];
            if (!mime) continue;
            try {
                const buffer = await fs.readFile(absPath);
                imageData = { buffer, mime };
            } catch {
                console.warn(`[WARN] Failed to read local image: ${absPath}`);
                continue;
            }
        }

        const processed = await processImageBuffer(imageData.buffer, imageData.mime, opts);
        const dataUrl = `data:${processed.mime};base64,${processed.buffer.toString("base64")}`;
        replacements.push({ original: full, replaced: `<img${before} src="${dataUrl}"${after}>` });
    }

    let result = html;
    for (const { original, replaced } of replacements) {
        result = result.replace(original, replaced);
    }
    return result;
}

function readImagePluginConfig(config: Config): ImagePluginConfig {
    const raw = config.plugins?.config?.["image"];
    return (raw && typeof raw === "object" ? raw : {}) as ImagePluginConfig;
}

function normalizeEmbedMode(raw: unknown): ImageEmbedMode | null {
    if (typeof raw !== "string") return null;
    const mode = raw.trim().toLowerCase();
    if (mode === "off" || mode === "base64") return mode;
    return null;
}

function resolveImageRuntime(config: Config): {
    embed: ImageEmbedMode;
    maxWidth: number;
    compress: number;
} {
    const raw = readImagePluginConfig(config);
    const embed = normalizeEmbedMode(raw.embed)
        ?? (typeof raw.base64_embed === "boolean" ? (raw.base64_embed ? "base64" : "off") : "off");
    const maxWidth = typeof raw.max_width === "number" && raw.max_width > 0 ? raw.max_width : 0;
    const compress = typeof raw.compress === "number"
        ? Math.max(1, Math.min(100, raw.compress))
        : 0;
    return { embed, maxWidth, compress };
}

export const imageEmbedPlugin: Plugin = {
    name: "image",

    registerCli(program) {
        const parseEmbedMode = (raw: string): "off" | "base64" => {
            const v = String(raw ?? "").trim().toLowerCase();
            if (v === "off" || v === "base64") return v;
            throw new Error("Invalid value for --img-embed. Use off|base64.");
        };
        program.option(
            "--img-embed <off|base64>",
            "Image embedding mode (use --img-embed=base64|off)",
            parseEmbedMode,
        );
        program.option("--img-max-width <pixels>", "Max image width in pixels (requires 'sharp' package)");
        program.option("--img-compress <1-100>", "Image compression quality 1-100 (requires 'sharp' package)");
    },

    cliToConfig(opts, out) {
        const previous = out.plugins ?? {};
        const prevConfig = previous.config ?? {};
        const prevImage = (prevConfig["image"] ?? {}) as Record<string, unknown>;
        const nextImage: Record<string, unknown> = { ...prevImage };

        const rawEmbed = opts["imgEmbed"];
        if (typeof rawEmbed === "string") {
            const mode = rawEmbed.toLowerCase();
            if (mode === "off" || mode === "base64") {
                nextImage["embed"] = mode;
            }
        }
        const maxWidth = opts["imgMaxWidth"];
        if (typeof maxWidth === "string" && maxWidth !== "") {
            const w = parseInt(maxWidth, 10);
            if (!isNaN(w) && w > 0) nextImage["max_width"] = w;
        }
        const compress = opts["imgCompress"];
        if (typeof compress === "string" && compress !== "") {
            const q = parseInt(compress, 10);
            if (!isNaN(q)) nextImage["compress"] = Math.max(1, Math.min(100, q));
        }

        out.plugins = {
            ...previous,
            config: {
                ...prevConfig,
                image: nextImage,
            },
        };
    },

    isEnabled: (config) => resolveImageRuntime(config).embed === "base64",

    async processHtml(html, config, context) {
        const runtime = resolveImageRuntime(config);
        return embedImagesInHtml(html, context.sourceDir, {
            maxWidth: runtime.maxWidth || undefined,
            compress: runtime.compress || undefined,
        });
    },
};

export interface ImageOptions {
    /** Enable/disable image embedding. */
    enable?: boolean;
    /** Embedding mode; currently supports off|base64. */
    embed?: "off" | "base64";
    /** Source directory for resolving relative image paths. */
    sourceDir?: string;
    /** Max output width (requires sharp). */
    maxWidth?: number;
    /** Compression quality 1-100 (requires sharp). */
    compress?: number;
    /** Advanced override for full config control. */
    config?: Partial<Config>;
}

function resolveImageConfig(options: ImageOptions = {}): Config {
    const embed = options.embed ?? (options.enable === false ? "off" : "base64");
    const plugins = options.config?.plugins ?? {};
    const pluginConfig = plugins.config ?? {};
    const image = (pluginConfig["image"] ?? {}) as Record<string, unknown>;
    return {
        ...DEFAULT_CONFIG,
        ...options.config,
        plugins: {
            ...plugins,
            config: {
                ...pluginConfig,
                image: {
                    ...image,
                    embed,
                    ...(options.maxWidth !== undefined ? { max_width: options.maxWidth } : {}),
                    ...(options.compress !== undefined ? { compress: options.compress } : {}),
                },
            },
        },
    };
}

/** Convenience transformer: `result = await image(result)` (Node-only) */
export async function image(html: string, options: ImageOptions = {}): Promise<string> {
    const config = resolveImageConfig(options);
    if (!imageEmbedPlugin.isEnabled(config) || !imageEmbedPlugin.processHtml) return html;
    return await imageEmbedPlugin.processHtml(html, config, {
        sourceDir: options.sourceDir ?? process.cwd(),
    });
}

/** Image plugin currently has no CSS/JS assets. */
export async function imageAssets(_options: ImageOptions = {}): Promise<PluginAssets> {
    return {};
}
