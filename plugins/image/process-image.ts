// ============================================================
// plugins/image/process-image.ts — 圖片 resize / compress
// 使用 sharp（選用依賴），未安裝時原樣回傳
// 從 src/adapters/node/fs.ts 移出
// ============================================================

/**
 * 選用 sharp 做 resize / compress。
 * sharp 未安裝或處理失敗時原樣回傳原始 buffer，不拋出錯誤。
 */
export async function processImageBuffer(
    buffer: Buffer,
    mime: string,
    opts: { maxWidth?: number; compress?: number },
): Promise<{ buffer: Buffer; mime: string }> {
    if ((!opts.maxWidth && !opts.compress) || mime === "image/svg+xml") {
        return { buffer, mime };
    }
    try {
        const sharp = (await import("sharp")).default;
        let pipe = sharp(buffer);
        if (opts.maxWidth) pipe = pipe.resize({ width: opts.maxWidth, withoutEnlargement: true });
        if (opts.compress) {
            const q = opts.compress;
            if (mime === "image/jpeg") pipe = pipe.jpeg({ quality: q });
            else if (mime === "image/webp") pipe = pipe.webp({ quality: q });
            else if (mime === "image/png") pipe = pipe.png({ quality: q });
        }
        const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
        return { buffer: data, mime: info.format ? `image/${info.format}` : mime };
    } catch {
        return { buffer, mime };
    }
}
