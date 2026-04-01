// ============================================================
// src/cli/logging.ts
// Shared CLI logging adapter (renderer + optional progress guard).
// ============================================================

import type { CliRenderer } from "./renderer.js";

export interface ProgressGuard {
  beforeLog: () => void;
}

export function stripLevelPrefix(message: string): string {
  return message.replace(/^\[(?:ERROR|Error|WARN|INFO)\]\s*/u, "");
}

export function createCliLogAdapter(renderer: CliRenderer, progress?: ProgressGuard) {
  const beforeLog = (): void => {
    progress?.beforeLog();
  };

  const info = (message: string): void => {
    beforeLog();
    console.info(renderer.formatInfo(stripLevelPrefix(message)));
  };

  const warn = (message: string): void => {
    beforeLog();
    console.warn(renderer.formatWarn(stripLevelPrefix(message)));
  };

  const error = (message: string): void => {
    beforeLog();
    console.error(renderer.formatError(stripLevelPrefix(message)));
  };

  const outputLine = (outputPath: string, sizeBytes: number | null): void => {
    beforeLog();
    console.info(renderer.formatOutputLine(outputPath, sizeBytes));
  };

  return {
    info,
    warn,
    error,
    outputLine,
    progressSucceed: info,
    progressFail: error,
  };
}

