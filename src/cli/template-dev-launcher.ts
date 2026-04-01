import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { CliArgs } from "../core/types.js";
import { CliError } from "./errors.js";

type TemplateDevLogger = {
  info: (message: string) => void;
};

function resolveScriptRunner(): string {
  const exe = path.basename(process.execPath).toLowerCase();
  if (exe.includes("node") || exe.includes("bun")) return process.execPath;
  return "node";
}

function resolveInputsOrDefault(rawInputs: string[]): string[] {
  if (rawInputs.length > 0) {
    const resolved = rawInputs.map((p) => path.resolve(process.cwd(), p));
    const missing = resolved.filter((p) => !fs.existsSync(p));
    if (missing.length > 0) {
      throw new CliError(`Cannot find input file/directory: ${missing[0]}`);
    }
    return resolved;
  }

  const fallback = path.resolve(process.cwd(), "README.md");
  if (!fs.existsSync(fallback)) {
    throw new CliError("template-dev default source not found: README.md");
  }
  return [fallback];
}

export async function runTemplateDevLauncher(
  args: CliArgs,
  logger: TemplateDevLogger,
  packageRoot: string,
): Promise<void> {
  const scriptPath = path.join(packageRoot, "dev-templates", "template-dev-server.mjs");
  if (!fs.existsSync(scriptPath)) {
    throw new CliError("template-dev is available only in source checkout.");
  }

  const templateSpec = (args.template || "normal").trim() || "normal";
  const inputs = resolveInputsOrDefault(args.inputs ?? []);
  const configPath = args.configPath
    ? path.resolve(process.cwd(), args.configPath)
    : "";
  if (configPath && !fs.existsSync(configPath)) {
    throw new CliError(`Cannot find config file: ${configPath}`);
  }

  logger.info(`template-dev mode: ${templateSpec}`);
  const runner = resolveScriptRunner();
  const childArgs = [
    scriptPath,
    "--project-root", packageRoot,
    "--workdir", process.cwd(),
    "--template", templateSpec,
    ...(configPath ? ["--config", configPath] : []),
    ...inputs.flatMap((input) => ["--input", input]),
  ];

  const result = spawnSync(runner, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new CliError(`Failed to start template-dev server: ${result.error.message}`);
  }
  if (result.status !== null && result.status !== 0) {
    throw new CliError(`template-dev server exited with code ${result.status}`);
  }
}
