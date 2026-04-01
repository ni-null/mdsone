// ============================================================
// src/cli/main.ts
// Thin CLI entrypoint: wire renderer + pipeline + exit handling.
// ============================================================

import { createCliRenderer } from "./renderer.js";
import { cliErrorMessages } from "./errors.js";
import { createProgressReporter } from "./progress-reporter.js";
import { createCliLogAdapter, stripLevelPrefix } from "./logging.js";

async function main(): Promise<void> {
  const userArgs = process.argv.slice(2);
  if (userArgs[0] === "mcp") {
    const { runMcpCommand } = await import("./mcp/command.js");
    await runMcpCommand(userArgs.slice(1));
    return;
  }

  const cliRenderer = createCliRenderer();
  const progress = createProgressReporter();
  const logs = createCliLogAdapter(cliRenderer, progress);

  try {
    const { runCli } = await import("./pipeline.js");
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
