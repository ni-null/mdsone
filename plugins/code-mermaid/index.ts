// ============================================================
// plugins/code-mermaid/index.ts
// Build-time Mermaid renderer: convert ```mermaid fences to SVG.
// Requires mmdc (@mermaid-js/mermaid-cli) installed in PATH.
// ============================================================

import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import type { CheerioAPI } from "cheerio";
import type { Config, Plugin, PluginAssets, PluginContext } from "../../src/core/types.js";
import { buildMermaidControlsHtml } from "./controls.js";

type CodeMermaidPluginConfig = {
  enable?: unknown;
  command?: unknown;
  security_level?: unknown;
};

type MermaidRuntime = {
  enable: boolean;
  command: string;
  securityLevel: "strict" | "loose" | "antiscript" | "sandbox";
};

type MermaidThemes = {
  dark: string;
  light: string;
};

type CommandResult = {
  ok: boolean;
  code: number | null;
  stderr: string;
  missing: boolean;
};

type MermaidSvgParts = {
  svgWithoutStyle: string;
  styleText: string;
};

const ALLOWED_SECURITY_LEVELS = new Set(["strict", "loose", "antiscript", "sandbox"]);
const DEFAULT_THEME_DARK = "dark";
const DEFAULT_THEME_LIGHT = "default";

const renderCache = new Map<string, Promise<string | null>>();
let warnedMmdcMissing = false;
let mermaidDetectedForPendingAssets = false;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readCodeMermaidPluginConfig(config: Config): CodeMermaidPluginConfig {
  const raw = config.plugins?.config?.["code-mermaid"];
  return (raw && typeof raw === "object" ? raw : {}) as CodeMermaidPluginConfig;
}

function detectLocalMmdcCommand(): string | null {
  const baseDir = process.cwd();
  const candidates = process.platform === "win32"
    ? [
      path.join(baseDir, "node_modules", ".bin", "mmdc.cmd"),
      path.join(baseDir, "node_modules", ".bin", "mmdc.exe"),
    ]
    : [path.join(baseDir, "node_modules", ".bin", "mmdc")];

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveRuntime(config: Config): MermaidRuntime {
  const raw = readCodeMermaidPluginConfig(config);
  const enable = typeof raw.enable === "boolean" ? raw.enable : true;
  const defaultCommand = detectLocalMmdcCommand() ?? "mmdc";
  const command = typeof raw.command === "string" && raw.command.trim() ? raw.command.trim() : defaultCommand;
  const securityRaw = typeof raw.security_level === "string" ? raw.security_level.trim().toLowerCase() : "strict";
  const securityLevel = ALLOWED_SECURITY_LEVELS.has(securityRaw)
    ? (securityRaw as MermaidRuntime["securityLevel"])
    : "strict";
  return { enable, command, securityLevel };
}

function resolveMermaidThemes(config: Config, context: PluginContext): MermaidThemes {
  const variantName = config.template_variant || "default";
  const rootCfg = context.templateData?.config?.code?.mermaid;
  const defaultTypeCfg = context.templateData?.config?.types?.default?.code?.mermaid;
  const variantCfg = context.templateData?.config?.types?.[variantName]?.code?.mermaid;
  const fallback = defaultTypeCfg ?? rootCfg;
  const dark = (variantCfg?.dark ?? fallback?.dark ?? DEFAULT_THEME_DARK).trim();
  const light = (variantCfg?.light ?? fallback?.light ?? DEFAULT_THEME_LIGHT).trim();
  return {
    dark: dark || DEFAULT_THEME_DARK,
    light: light || DEFAULT_THEME_LIGHT,
  };
}

function normalizeMermaidSource(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

function hasThemeInitOverride(source: string): boolean {
  return /%%\{\s*init\s*:[\s\S]*?\b(?:theme|themeVariables)\b[\s\S]*?\}%%/i.test(source);
}

function hasMermaidFence(markdownText: string): boolean {
  return /(?:^|\n)[ \t]*(?:```|~~~)[ \t]*mermaid(?:[ \t].*)?(?:\n|$)/i.test(markdownText);
}

function cleanupSvg(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>\s*/i, "")
    .trim();
}

function splitSvgStyle(svg: string): MermaidSvgParts | null {
  const match = svg.match(/^<svg\b([^>]*)>([\s\S]*?)<\/svg>$/i);
  if (!match) return null;

  const attrs = match[1] ?? "";
  const inner = match[2] ?? "";
  const styleMatch = inner.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  const styleText = (styleMatch?.[1] ?? "").trim();
  const innerWithoutStyle = styleMatch ? inner.replace(styleMatch[0], "") : inner;
  return {
    svgWithoutStyle: `<svg${attrs}>${innerWithoutStyle}</svg>`,
    styleText,
  };
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function injectSvgStyle(svgWithoutStyle: string, styleText: string): string {
  if (!styleText) return svgWithoutStyle;
  return svgWithoutStyle.replace(
    /^<svg\b([^>]*)>/i,
    `<svg$1><style data-mermaid-theme-style="1">${styleText}</style>`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namespaceSvgIds(svg: string, namespace: string): string {
  const ids = [...new Set(
    [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => String(m[1] ?? "").trim()).filter(Boolean),
  )];
  if (ids.length === 0) return svg;

  let result = svg;
  for (const id of ids) {
    const escaped = escapeRegExp(id);
    const nextId = `${namespace}-${id}`;
    result = result.replace(new RegExp(`\\bid="${escaped}"`, "g"), `id="${nextId}"`);
    result = result.replace(
      new RegExp(`(?<![\\w-])#${escaped}(?![\\w-])`, "g"),
      `#${nextId}`,
    );
  }
  return result;
}

function cacheKey(source: string, theme: string, securityLevel: string, command: string): string {
  const payload = `${theme}\n${securityLevel}\n${command}\n${source}`;
  return createHash("sha1").update(payload).digest("hex");
}

function resolveCommandCandidates(command: string): string[] {
  if (process.platform !== "win32") return [command];
  if (/[\\/]/.test(command) || /\.[A-Za-z0-9]+$/.test(path.basename(command))) {
    return [command];
  }
  return [`${command}.cmd`, `${command}.exe`, command];
}

function shouldUseShell(command: string): boolean {
  if (process.platform !== "win32") return false;
  const base = path.basename(command).toLowerCase();
  return base.endsWith(".cmd") || base.endsWith(".bat");
}

function isPathLike(command: string): boolean {
  if (/[\\/]/.test(command)) return true;
  if (/^[A-Za-z]:/.test(command)) return true;
  if (command.startsWith(".")) return true;
  return false;
}

async function commandExists(command: string): Promise<boolean> {
  if (isPathLike(command)) {
    return fsSync.existsSync(command);
  }

  const pathEnv = String(process.env.PATH ?? "");
  if (!pathEnv.trim()) return false;
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = pathEnv
    .split(sep)
    .map((x) => x.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);

  if (process.platform === "win32") {
    const hasExt = /\.[A-Za-z0-9]+$/.test(path.basename(command));
    const rawExts = String(process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    const exts = hasExt ? [""] : rawExts;
    for (const dir of dirs) {
      for (const ext of exts) {
        const full = path.join(dir, `${command}${ext}`);
        if (fsSync.existsSync(full)) return true;
      }
    }
    return false;
  }

  for (const dir of dirs) {
    const full = path.join(dir, command);
    if (fsSync.existsSync(full)) return true;
  }
  return false;
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      shell: shouldUseShell(command),
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk ?? "");
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      resolve({
        ok: false,
        code: null,
        stderr: err.message,
        missing: err.code === "ENOENT",
      });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stderr: stderr.trim(),
        missing: false,
      });
    });
  });
}

async function runMmdc(command: string, args: string[]): Promise<CommandResult> {
  const candidates = resolveCommandCandidates(command);
  let lastResult: CommandResult | null = null;

  for (const candidate of candidates) {
    const exists = await commandExists(candidate);
    if (!exists) {
      lastResult = {
        ok: false,
        code: null,
        stderr: "",
        missing: true,
      };
      continue;
    }

    const result = await runCommand(candidate, args);
    if (!result.missing) return result;
    lastResult = result;
  }

  return lastResult ?? {
    ok: false,
    code: null,
    stderr: "",
    missing: true,
  };
}

async function renderMermaidSvg(
  source: string,
  theme: string,
  runtime: MermaidRuntime,
): Promise<string | null> {
  const key = cacheKey(source, theme, runtime.securityLevel, runtime.command);
  const cached = renderCache.get(key);
  if (cached) return await cached;

  const task = (async (): Promise<string | null> => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mdsone-mermaid-"));
    const inputFile = path.join(tmpDir, "diagram.mmd");
    const outputFile = path.join(tmpDir, "diagram.svg");
    const configFile = path.join(tmpDir, "config.json");

    try {
      await fs.writeFile(inputFile, source, "utf8");
      await fs.writeFile(
        configFile,
        JSON.stringify(
          {
            theme,
            securityLevel: runtime.securityLevel,
            startOnLoad: false,
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runMmdc(runtime.command, [
        "-i", inputFile,
        "-o", outputFile,
        "-c", configFile,
        "-b", "transparent",
      ]);

      if (!result.ok) {
        if (result.missing) {
          if (!warnedMmdcMissing) {
            warnedMmdcMissing = true;
            console.warn(
              '[WARN] Plugin "code-mermaid" requires mmdc (@mermaid-js/mermaid-cli) in PATH. Mermaid blocks are left as code.',
            );
          }
        } else {
          const suffix = result.stderr ? ` ${result.stderr}` : "";
          console.warn(`[WARN] Plugin "code-mermaid" render failed (theme=${theme}).${suffix}`);
        }
        return null;
      }

      const svg = await fs.readFile(outputFile, "utf8");
      const cleaned = cleanupSvg(svg);
      return cleaned || null;
    } catch (e) {
      console.warn(`[WARN] Plugin "code-mermaid" render error: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure.
      }
    }
  })();

  renderCache.set(key, task);
  return await task;
}

async function renderMermaidSvgWithFallback(
  source: string,
  runtime: MermaidRuntime,
  primaryTheme: string,
  fallbackThemes: string[],
): Promise<string | null> {
  const tried = new Set<string>();
  const candidates = [primaryTheme, ...fallbackThemes]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  for (const theme of candidates) {
    if (tried.has(theme)) continue;
    tried.add(theme);
    const svg = await renderMermaidSvg(source, theme, runtime);
    if (svg) return svg;
  }
  return null;
}

function buildMermaidFigure(svg: string, lightStyleB64: string, darkStyleB64: string, sourceBase64: string): string {
  return [
    `<figure class="mdsone-mermaid" data-mermaid-rendered="1" data-mermaid-themed="1" data-mermaid-source-b64="${sourceBase64}">`,
    `  <script type="text/plain" class="mdsone-mermaid-style-light">${lightStyleB64}</script>`,
    `  <script type="text/plain" class="mdsone-mermaid-style-dark">${darkStyleB64}</script>`,
    buildMermaidControlsHtml(),
    '  <div class="mdsone-mermaid__viewport">',
    `    <div class="mdsone-mermaid__svg">${svg}</div>`,
    "  </div>",
    "</figure>",
  ].join("\n");
}

export const codeMermaidPlugin: Plugin = {
  name: "code-mermaid",

  isEnabled(config) {
    return resolveRuntime(config).enable;
  },

  extendMarkdown(_md, _config, context) {
    const markdownText = typeof context.markdownText === "string" ? context.markdownText : "";
    if (markdownText && hasMermaidFence(markdownText)) {
      mermaidDetectedForPendingAssets = true;
    }
  },

  async processDom(dom, config, context) {
    const $ = dom as CheerioAPI;
    const preBlocks = $("pre").toArray().filter((preNode) => {
      const pre = $(preNode);
      const dataLang = String(pre.attr("data-lang") ?? "").trim().toLowerCase();
      if (dataLang === "mermaid") return true;

      const code = pre.children("code").first();
      const className = String(code.attr("class") ?? "");
      return /\blanguage-mermaid\b/i.test(className);
    });
    if (preBlocks.length === 0) return;
    mermaidDetectedForPendingAssets = true;

    const runtime = resolveRuntime(config);
    const themes = resolveMermaidThemes(config, context);

    for (const preNode of preBlocks) {
      const pre = $(preNode);
      const code = pre.children("code").first();
      const sourceRaw = code.length > 0 ? code.text() : pre.text();
      const source = normalizeMermaidSource(sourceRaw || "");
      if (!source) continue;

      const [lightSvgRaw, darkSvgRaw] = await Promise.all([
        renderMermaidSvgWithFallback(
          source,
          runtime,
          themes.light,
          [DEFAULT_THEME_LIGHT, "default", "neutral", "base"],
        ),
        renderMermaidSvgWithFallback(
          source,
          runtime,
          themes.dark,
          [DEFAULT_THEME_DARK, "dark", "default", "base"],
        ),
      ]);

      const lightSvg = cleanupSvg(lightSvgRaw ?? "");
      const darkSvg = cleanupSvg(darkSvgRaw ?? "");
      if (!lightSvg && !darkSvg) continue;

      const finalLight = lightSvg || darkSvg;
      const finalDark = darkSvg || lightSvg;
      if (!finalLight || !finalDark) continue;

      const scopedSeed = createHash("sha1").update(source).digest("hex").slice(0, 10);
      const scopedLight = namespaceSvgIds(finalLight, `mdsone-${scopedSeed}`);
      const scopedDark = namespaceSvgIds(finalDark, `mdsone-${scopedSeed}`);
      const lightParts = splitSvgStyle(scopedLight);
      const darkParts = splitSvgStyle(scopedDark);
      if (!lightParts || !darkParts) continue;

      const lightStyle = decodeBasicHtmlEntities(lightParts.styleText || darkParts.styleText);
      const darkStyle = decodeBasicHtmlEntities(darkParts.styleText || lightParts.styleText);
      if (
        lightStyle
        && darkStyle
        && lightStyle === darkStyle
        && themes.light !== themes.dark
        && !hasThemeInitOverride(source)
      ) {
        console.warn(
          `[WARN] Plugin "code-mermaid" light/dark styles are identical (light=${themes.light}, dark=${themes.dark}).`,
        );
      }
      const mergedSvg = injectSvgStyle(lightParts.svgWithoutStyle, lightStyle);
      const lightStyleB64 = encodeBase64(lightStyle);
      const darkStyleB64 = encodeBase64(darkStyle);
      const sourceBase64 = encodeBase64(source);
      pre.replaceWith(buildMermaidFigure(mergedSvg, lightStyleB64, darkStyleB64, sourceBase64));
    }
  },

  getAssets(): PluginAssets {
    if (!mermaidDetectedForPendingAssets) return {};
    mermaidDetectedForPendingAssets = false;
    return {
      cssFiles: ["mermaid.css"],
      jsFiles: ["mermaid-runtime-utils.js", "mermaid-theme-switch.js", "mermaid-zoom.js"],
    };
  },
};
