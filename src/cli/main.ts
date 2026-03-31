// ============================================================
// src/cli/main.ts
// Thin CLI entrypoint: wire renderer + pipeline + exit handling.
// ============================================================

import { createCliRenderer } from "./renderer.js";
import { cliErrorMessages } from "./errors.js";
import ora, { type Ora } from "ora";

const cliRenderer = createCliRenderer();
let spinner: Ora | null = null;
let spinnerText = "";
let spinnerActive = false;

function resolveSpinnerEnabled(): boolean {
  const override = String(process.env.MDSONE_SPINNER ?? "").trim();
  if (override === "1") return true;
  if (override === "0") return false;

  const stderrTTY = typeof process.stderr?.isTTY === "boolean" ? process.stderr.isTTY : undefined;
  const stdoutTTY = typeof process.stdout?.isTTY === "boolean" ? process.stdout.isTTY : undefined;

  if (stderrTTY === true || stdoutTTY === true) return true;
  if (stderrTTY === false && stdoutTTY === false) return false;

  // Bun compiled exe on Windows may not expose isTTY reliably.
  if (process.platform === "win32" && !process.env.CI) return true;
  return false;
}

function getSpinner(): Ora {
  if (!spinner) {
    spinner = ora({
      isEnabled: resolveSpinnerEnabled(),
      discardStdin: false,
    });
  }
  return spinner;
}

function pauseSpinnerForLog(): void {
  if (!spinner || !spinnerActive || !spinner.isSpinning) return;
  spinner.stop();
}

function resumeSpinnerAfterLog(): void {
  if (!spinner || !spinnerActive) return;
  if (!spinnerText) return;
  if (!spinner.isSpinning) spinner.start(spinnerText);
}

function startBootSpinner(text = "Starting mdsone"): void {
  spinnerText = text;
  spinnerActive = true;
  const s = getSpinner();
  if (s.isSpinning) s.text = text;
  else s.start(text);
}

function stripLevelPrefix(message: string): string {
  return message.replace(/^\[(?:ERROR|Error|WARN|INFO)\]\s*/u, "");
}

function logInfo(message: string): void {
  pauseSpinnerForLog();
  console.info(cliRenderer.formatInfo(stripLevelPrefix(message)));
  resumeSpinnerAfterLog();
}

function logWarn(message: string): void {
  pauseSpinnerForLog();
  console.warn(cliRenderer.formatWarn(stripLevelPrefix(message)));
  resumeSpinnerAfterLog();
}

function logError(message: string): void {
  pauseSpinnerForLog();
  console.error(cliRenderer.formatError(stripLevelPrefix(message)));
  resumeSpinnerAfterLog();
}

async function main(): Promise<void> {
  const userArgs = process.argv.slice(2);
  if (userArgs[0] === "mcp") {
    const { runMcpCommand } = await import("./mcp/command.js");
    await runMcpCommand(userArgs.slice(1));
    return;
  }

  // Start feedback immediately before heavy pipeline modules are loaded.
  startBootSpinner("Starting mdsone");
  const { runCli } = await import("./pipeline.js");

  await runCli({
    info: logInfo,
    warn: logWarn,
    error: logError,
    outputLine(outputPath, sizeBytes) {
      pauseSpinnerForLog();
      console.info(cliRenderer.formatOutputLine(outputPath, sizeBytes));
      resumeSpinnerAfterLog();
    },
    progressStart(message) {
      const text = stripLevelPrefix(message);
      spinnerText = text;
      spinnerActive = true;
      const s = getSpinner();
      if (s.isSpinning) s.text = text;
      else s.start(text);
    },
    progressUpdate(message) {
      const text = stripLevelPrefix(message);
      spinnerText = text;
      spinnerActive = true;
      const s = getSpinner();
      if (s.isSpinning) s.text = text;
      else s.start(text);
    },
    progressSucceed(message) {
      const text = stripLevelPrefix(message);
      const s = getSpinner();
      if (s.isSpinning) s.succeed(text);
      else console.info(cliRenderer.formatInfo(text));
      spinnerText = "";
      spinnerActive = false;
    },
    progressFail(message) {
      const text = stripLevelPrefix(message);
      const s = getSpinner();
      if (s.isSpinning) s.fail(text);
      else console.error(cliRenderer.formatError(text));
      spinnerText = "";
      spinnerActive = false;
    },
    progressStop() {
      if (spinner && spinner.isSpinning) spinner.stop();
      spinnerText = "";
      spinnerActive = false;
    },
  });
}

main().catch((error) => {
  if (spinner && spinner.isSpinning) {
    spinner.fail("CLI failed");
  }
  spinnerText = "";
  spinnerActive = false;
  const { exitCode, lines } = cliErrorMessages(error);
  for (const line of lines) {
    logError(line);
  }
  process.exit(exitCode);
});
