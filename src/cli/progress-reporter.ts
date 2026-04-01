// ============================================================
// src/cli/progress-reporter.ts
// Shared CLI progress line reporter for Node/Bun entrypoints.
// ============================================================

import { canRewriteLine, isColorOutputEnabled, isInteractiveTerminal } from "./terminal.js";

const PROGRESS_ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m",
} as const;

type ProgressColor = keyof typeof PROGRESS_ANSI;

function stripLevelPrefix(message: string): string {
  return message.replace(/^\[(?:ERROR|Error|WARN|INFO)\]\s*/u, "");
}

function extractBatchPrefix(message: string): string {
  const clean = stripLevelPrefix(message);
  const matched = clean.match(/^\(\d+\/\d+\)/u);
  return matched ? matched[0] : "";
}

function extractCurrentFileName(message: string): string {
  const clean = stripLevelPrefix(message).trim();
  const withoutBatch = clean.replace(/^\(\d+\/\d+\)\s*/u, "");
  if (/^Read input:\s*/u.test(withoutBatch)) {
    return withoutBatch.replace(/^Read input:\s*/u, "").trim();
  }
  const dashIdx = withoutBatch.indexOf(" - ");
  if (dashIdx > 0) {
    return withoutBatch.slice(0, dashIdx).trim();
  }
  return "";
}

function colorEnabled(): boolean {
  return isColorOutputEnabled();
}

function paint(text: string, color: ProgressColor): string {
  if (!colorEnabled()) return text;
  return `${PROGRESS_ANSI[color]}${text}${PROGRESS_ANSI.reset}`;
}

function paintFile(text: string): string {
  if (!colorEnabled()) return text;
  return `${PROGRESS_ANSI.bold}${PROGRESS_ANSI.magenta}${text}${PROGRESS_ANSI.reset}`;
}

export interface ProgressReporter {
  onStart: (message: string) => void;
  onUpdate: (message: string) => void;
  onStop: () => void;
  beforeLog: () => void;
  teardown: () => void;
}

export function createProgressReporter(options?: {
  stream?: NodeJS.WriteStream;
  refreshMs?: number;
}): ProgressReporter {
  const stream = options?.stream ?? process.stderr;
  const refreshMs = Number.isFinite(options?.refreshMs) ? Number(options?.refreshMs) : 100;

  let startedAtMs: number | null = null;
  let progressVisible = false;
  let lastLine = "";
  let lastMessage = "";
  let currentFile = "";
  let ticker: NodeJS.Timeout | null = null;

  function clearLine(): void {
    if (!progressVisible) return;
    if (canRewriteLine(stream)) {
      stream.write("\r\x1b[2K");
    }
    progressVisible = false;
  }

  function stopTicker(): void {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function renderLine(message: string): void {
    if (!isInteractiveTerminal()) return;
    if (startedAtMs === null) startedAtMs = Date.now();

    const elapsedMs = Math.max(0, Date.now() - startedAtMs);
    const elapsedSec = elapsedMs / 1000;
    const elapsedText = elapsedSec < 10 ? `${elapsedSec.toFixed(1)}s` : `${Math.floor(elapsedSec)}s`;
    const prefix = extractBatchPrefix(message);
    const fileName = currentFile || extractCurrentFileName(message);
    const parts = [
      paint("[mdsone]", "cyan"),
      prefix ? paint(prefix, "dim") : "",
      fileName ? paintFile(fileName) : "",
      paint("process", "dim"),
      paint(elapsedText, "yellow"),
      paint("...", "green"),
    ].filter(Boolean);
    const line = parts.join(" ");
    if (line === lastLine) return;
    lastLine = line;

    if (canRewriteLine(stream)) {
      stream.write(`\r${line}`);
      progressVisible = true;
    }
  }

  function ensureTicker(): void {
    if (!isInteractiveTerminal()) return;
    if (ticker) return;
    ticker = setInterval(() => {
      if (!lastMessage) return;
      renderLine(lastMessage);
    }, refreshMs);
    if (typeof ticker.unref === "function") ticker.unref();
  }

  function resetState(): void {
    startedAtMs = null;
    lastLine = "";
    lastMessage = "";
    currentFile = "";
  }

  return {
    onStart(message: string): void {
      lastMessage = message;
      const fileName = extractCurrentFileName(message);
      if (fileName) currentFile = fileName;
      if (startedAtMs === null) startedAtMs = Date.now();
      renderLine(message);
      ensureTicker();
    },
    onUpdate(message: string): void {
      lastMessage = message;
      const fileName = extractCurrentFileName(message);
      if (fileName) currentFile = fileName;
      renderLine(message);
      ensureTicker();
    },
    onStop(): void {
      stopTicker();
      clearLine();
      resetState();
    },
    beforeLog(): void {
      clearLine();
    },
    teardown(): void {
      stopTicker();
      clearLine();
      resetState();
    },
  };
}

