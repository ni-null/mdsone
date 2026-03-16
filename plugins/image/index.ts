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
import type { Plugin } from "../../src/core/types.js";
import { fetchRemoteImage, MIME_MAP } from "./fetch-image.js";
import { processImageBuffer } from "./process-image.js";

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

export const imageEmbedPlugin: Plugin = {
    name: "image",

    isEnabled: (config) => config.img_to_base64,

    async processHtml(html, config, context) {
        return embedImagesInHtml(html, context.sourceDir, {
            maxWidth: config.img_max_width || undefined,
            compress: config.img_compress || undefined,
        });
    },
};
