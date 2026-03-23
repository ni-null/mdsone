// ============================================================
// Bun/entry.ts
// Bun-compiled CLI entrypoint with runtime asset path bootstrap.
// ============================================================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCliRenderer } from "../src/cli/renderer.js";
import { cliErrorMessages } from "../src/cli/errors.js";
import { runCli } from "../src/cli/pipeline.js";
import { runMcpCommand } from "../src/cli/mcp/command.js";
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
    const katexDistDir = path.join(embeddedRoot, EMBEDDED_ROOTS.katexDist);

    if (!process.env.TEMPLATES_DIR && fs.existsSync(templatesDir)) {
      process.env.TEMPLATES_DIR = templatesDir;
    }
    if (!process.env.LOCALES_DIR && fs.existsSync(localesDir)) {
      process.env.LOCALES_DIR = localesDir;
    }
    if (!process.env.KATEX_DIST_DIR && fs.existsSync(path.join(katexDistDir, "katex.min.css"))) {
      process.env.KATEX_DIST_DIR = katexDistDir;
    }
    return;
  }

  const exeDir = path.dirname(process.execPath);
  const runtimeDir = path.join(exeDir, "runtime");
  const templatesDir = path.join(runtimeDir, "templates");
  const localesDir = path.join(runtimeDir, "locales");

  if (!process.env.TEMPLATES_DIR && fs.existsSync(templatesDir)) {
    process.env.TEMPLATES_DIR = templatesDir;
  }
  if (!process.env.LOCALES_DIR && fs.existsSync(localesDir)) {
    process.env.LOCALES_DIR = localesDir;
  }
}

const cliRenderer = createCliRenderer();

function stripLevelPrefix(message: string): string {
  return message.replace(/^\[(?:ERROR|Error|WARN|INFO)\]\s*/u, "");
}

function logInfo(message: string): void {
  console.info(cliRenderer.formatInfo(stripLevelPrefix(message)));
}

function logWarn(message: string): void {
  console.warn(cliRenderer.formatWarn(stripLevelPrefix(message)));
}

function logError(message: string): void {
  console.error(cliRenderer.formatError(stripLevelPrefix(message)));
}

async function main(): Promise<void> {
  await bootstrapRuntimeAssetDirs();

  const userArgs = process.argv.slice(2);
  if (userArgs[0] === "mcp") {
    await runMcpCommand(userArgs.slice(1));
    return;
  }

  await runCli({
    info: logInfo,
    warn: logWarn,
    error: logError,
    outputLine(outputPath, sizeBytes) {
      console.info(cliRenderer.formatOutputLine(outputPath, sizeBytes));
    },
  });
}

main().catch((error) => {
  const { exitCode, lines } = cliErrorMessages(error);
  for (const line of lines) {
    logError(line);
  }
  process.exit(exitCode);
});
