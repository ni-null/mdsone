// ============================================================
// Bun/entry.ts
// Bun-compiled CLI entrypoint with runtime asset path bootstrap.
// ============================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ora, { type Ora } from "ora";
import { createCliRenderer } from "../src/cli/renderer.js";
import { cliErrorMessages } from "../src/cli/errors.js";
import { EMBEDDED_ASSETS, EMBEDDED_ROOTS } from "./generated/embedded-assets.js";

async function writeEmbeddedAssetToDisk(embeddedPath: string, outPath: string): Promise<void> {
  const bunApi = (globalThis as unknown as { Bun?: { file: (p: string) => { arrayBuffer: () => Promise<ArrayBuffer> } } }).Bun;
  if (bunApi && typeof bunApi.file === "function") {
    const bytes = await bunApi.file(embeddedPath).arrayBuffer();
    fs.writeFileSync(outPath, Buffer.from(bytes));
    return;
  }
  fs.copyFileSync(embeddedPath, outPath);
}

async function materializeEmbeddedAssets(): Promise<string | null> {
  if (!Array.isArray(EMBEDDED_ASSETS) || EMBEDDED_ASSETS.length === 0) return null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mdsone-bun-"));
  for (const asset of EMBEDDED_ASSETS) {
    const outPath = path.join(root, asset.logicalPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await writeEmbeddedAssetToDisk(asset.embeddedPath, outPath);
  }
  return root;
}

async function bootstrapRuntimeAssetDirs(): Promise<void> {
  const embeddedRoot = await materializeEmbeddedAssets();
  if (embeddedRoot) {
    const templatesDir = path.join(embeddedRoot, EMBEDDED_ROOTS.templates);
    const localesDir = path.join(embeddedRoot, EMBEDDED_ROOTS.locales);

    if (!process.env.MDSONE_TEMPLATE_ROOT && fs.existsSync(templatesDir)) {
      process.env.MDSONE_TEMPLATE_ROOT = templatesDir;
    }
    if (!process.env.LOCALES_DIR && fs.existsSync(localesDir)) {
      process.env.LOCALES_DIR = localesDir;
    }
    return;
  }

  const exeDir = path.dirname(process.execPath);
  const runtimeDir = path.join(exeDir, "runtime");
  const templatesDir = path.join(runtimeDir, "templates");
  const localesDir = path.join(runtimeDir, "locales");

  if (!process.env.MDSONE_TEMPLATE_ROOT && fs.existsSync(templatesDir)) {
    process.env.MDSONE_TEMPLATE_ROOT = templatesDir;
  }
  if (!process.env.LOCALES_DIR && fs.existsSync(localesDir)) {
    process.env.LOCALES_DIR = localesDir;
  }
}

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
  if (!spinner || !spinnerActive || !spinnerText) return;
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
    await bootstrapRuntimeAssetDirs();
    const { runMcpCommand } = await import("../src/cli/mcp/command.js");
    await runMcpCommand(userArgs.slice(1));
    return;
  }

  startBootSpinner("Starting mdsone");
  await bootstrapRuntimeAssetDirs();
  const { runCli } = await import("../src/cli/pipeline.js");

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
