// ============================================================
// plugins/image-embed/fetch-image.ts — 遠端圖片 fetch
// 從 src/adapters/node/fs.ts 移出
// ============================================================

import path from "node:path";

/** 副檔名 → MIME type 對應表 */
export const MIME_MAP: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
};

/** 從遠端 URL fetch 圖片，回傳 buffer + mime；失敗時回傳 null */
export async function fetchRemoteImage(
    url: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; mdsone-image-embedder/1.0)",
                "Accept": "image/*,*/*;q=0.8",
            },
        });
        if (!res.ok) {
            console.warn(`[WARN] Remote image HTTP ${res.status}: ${url}`);
            return null;
        }
        const contentType = res.headers.get("content-type") ?? "";
        const mime = contentType.split(";")[0].trim();
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        const resolvedMime = mime.startsWith("image/") ? mime : (MIME_MAP[ext] ?? "");
        if (!resolvedMime) return null;
        return { buffer: Buffer.from(await res.arrayBuffer()), mime: resolvedMime };
    } catch (e) {
        console.warn(
            `[WARN] Failed to fetch remote image (${e instanceof Error ? e.message : e}): ${url}`,
        );
        return null;
    }
}
