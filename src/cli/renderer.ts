// ============================================================
// src/cli/renderer.ts - CLI output rendering (icons/colors/size)
// Isolated presentation layer for easy rollback/replacement.
// ============================================================

const ANSI = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
} as const;

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "on" || t === "yes";
}

function isFalsy(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "0" || t === "false" || t === "off" || t === "no";
}

function supportsColor(stream: { isTTY?: boolean }, env: Record<string, string | undefined>): boolean {
  if (!stream.isTTY) return false;
  if (env["NO_COLOR"] !== undefined) return false;
  return true;
}

function supportsUnicode(stream: { isTTY?: boolean }, env: Record<string, string | undefined>): boolean {
  // Manual override first.
  if (isTruthy(env["MDSONE_UNICODE"])) return true;
  if (isFalsy(env["MDSONE_UNICODE"])) return false;

  if (!stream.isTTY) return false;
  if ((env["TERM"] || "").toLowerCase() === "dumb") return false;

  // Windows terminals vary; prefer conservative auto-enable only on common UTF-8 capable terminals.
  if (process.platform === "win32") {
    if (env["WT_SESSION"]) return true; // Windows Terminal
    if ((env["TERM_PROGRAM"] || "").toLowerCase() === "vscode") return true;
    if ((env["TERM"] || "").toLowerCase().includes("xterm")) return true;
    const lang = `${env["LC_ALL"] || ""}${env["LANG"] || ""}`.toLowerCase();
    if (lang.includes("utf-8") || lang.includes("utf8")) return true;
    return false;
  }

  return true;
}

function paint(text: string, color: keyof typeof ANSI, enabled: boolean): string {
  if (!enabled) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

export interface CliRenderer {
  formatInfo: (message: string) => string;
  formatWarn: (message: string) => string;
  formatError: (message: string) => string;
  formatOutputLine: (outputPath: string, sizeBytes: number | null) => string;
}

export function createCliRenderer(
  stream: { isTTY?: boolean } = process.stdout,
  env: Record<string, string | undefined> = process.env,
): CliRenderer {
  const colorEnabled = supportsColor(stream, env);
  const unicodeEnabled = supportsUnicode(stream, env);

  const icons = {
    success: unicodeEnabled ? "\u2714" : "OK",
    info: unicodeEnabled ? "\u2139" : "INFO",
    warn: unicodeEnabled ? "\u26A0" : "WARN",
    error: unicodeEnabled ? "\u2716" : "ERROR",
  } as const;

  const formatWithLevel = (
    level: "INFO" | "WARN" | "ERROR",
    icon: string,
    color: "green" | "yellow" | "red" | "cyan",
    message: string,
  ): string => {
    const iconText = paint(icon, color, colorEnabled);
    return `[${level}] ${iconText} ${message}`;
  };

  return {
    formatInfo(message: string): string {
      return formatWithLevel("INFO", icons.info, "cyan", message);
    },
    formatWarn(message: string): string {
      return formatWithLevel("WARN", icons.warn, "yellow", message);
    },
    formatError(message: string): string {
      return formatWithLevel("ERROR", icons.error, "red", message);
    },
    formatOutputLine(outputPath: string, sizeBytes: number | null): string {
      const sizeText = sizeBytes !== null ? formatBytes(sizeBytes) : "unknown size";
      const pathText = paint(outputPath, "cyan", colorEnabled);
      const sizeLabel = paint(sizeText, "green", colorEnabled);
      return formatWithLevel("INFO", icons.success, "green", `Output: ${pathText} (${sizeLabel})`);
    },
  };
}
