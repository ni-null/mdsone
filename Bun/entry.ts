// ============================================================
// Bun/entry.ts
// Bun-compiled CLI entrypoint with runtime asset path bootstrap.
// ============================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCliRenderer } from "../src/cli/renderer.js";
import { cliErrorMessages } from "../src/cli/errors.js";
import { createProgressReporter } from "../src/cli/progress-reporter.js";
import { createCliLogAdapter, stripLevelPrefix } from "../src/cli/logging.js";
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

async function main(): Promise<void> {
  const userArgs = process.argv.slice(2);
  if (userArgs[0] === "mcp") {
    await bootstrapRuntimeAssetDirs();
    const { runMcpCommand } = await import("../src/cli/mcp/command.js");
    await runMcpCommand(userArgs.slice(1));
    return;
  }

  await bootstrapRuntimeAssetDirs();

  const cliRenderer = createCliRenderer();
  const progress = createProgressReporter();
  const logs = createCliLogAdapter(cliRenderer, progress);

  try {
    const { runCli } = await import("../src/cli/pipeline.js");
    await runCli({
      info: logs.info,
      warn: logs.warn,
      error: logs.error,
      outputLine: logs.outputLine,
      progressStart(message) {
        progress.onStart(message);
      },
      progressUpdate(message) {
        progress.onUpdate(message);
      },
      progressSucceed: logs.progressSucceed,
      progressFail: logs.progressFail,
      progressStop() {
        progress.onStop();
      },
    });
  } finally {
    progress.teardown();
  }
}

main().catch((error) => {
  const cliRenderer = createCliRenderer();
  const { exitCode, lines } = cliErrorMessages(error);
  for (const line of lines) {
    console.error(cliRenderer.formatError(stripLevelPrefix(line)));
  }
  process.exit(exitCode);
});
