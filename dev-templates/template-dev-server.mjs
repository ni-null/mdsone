#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";

function trySpawnSync(command, args, options) {
  try {
    return spawnSync(command, args, options);
  } catch (error) {
    return {
      status: null,
      stdout: "",
      stderr: "",
      error,
    };
  }
}

function parseArgv(argv) {
  const out = {
    projectRoot: "",
    workdir: "",
    template: "normal",
    inputs: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--project-root" && next) {
      out.projectRoot = next;
      i++;
      continue;
    }
    if (key === "--workdir" && next) {
      out.workdir = next;
      i++;
      continue;
    }
    if (key === "--template" && next) {
      out.template = next;
      i++;
      continue;
    }
    if (key === "--input" && next) {
      out.inputs.push(next);
      i++;
      continue;
    }
  }
  return out;
}

function splitTemplateSpec(spec) {
  const raw = String(spec || "normal").trim();
  const idx = raw.lastIndexOf("@");
  if (idx > 0) return raw.slice(0, idx);
  return raw;
}

function isPathLikeTemplate(rawTemplate) {
  return path.isAbsolute(rawTemplate) || rawTemplate.includes("/") || rawTemplate.includes("\\");
}

function resolveTemplateDir(projectRoot, workdir, templateSpec) {
  const rawTemplate = splitTemplateSpec(templateSpec);
  if (isPathLikeTemplate(rawTemplate)) {
    return path.isAbsolute(rawTemplate)
      ? rawTemplate
      : path.resolve(workdir, rawTemplate);
  }
  return path.join(projectRoot, "templates", rawTemplate);
}

function ensureFileExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message);
  }
}

function buildOnce({ projectRoot, workdir, templateSpec, inputs, outputFile }) {
  const tsxCliPath = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const cliEntryPath = path.join(projectRoot, "src", "cli", "main.ts");
  ensureFileExists(
    cliEntryPath,
    `template-dev requires source CLI entry: missing ${cliEntryPath}`,
  );

  const buildArgsTail = [
    ...inputs,
    "-m",
    "-f",
    "-o",
    outputFile,
    "--template",
    templateSpec,
  ];

  const currentExe = String(process.execPath || "");
  const currentName = path.basename(currentExe).toLowerCase();
  let firstSpawnError = null;
  const runningOnBun = currentName.includes("bun");

  const nodeCandidates = currentName.includes("node")
    ? [currentExe, "node"]
    : ["node"];
  if (!runningOnBun && fs.existsSync(tsxCliPath)) {
    for (const nodeCmd of nodeCandidates) {
      const result = trySpawnSync(
        nodeCmd,
        [tsxCliPath, cliEntryPath, ...buildArgsTail],
        {
          cwd: workdir,
          env: process.env,
          encoding: "utf8",
        },
      );
      if (!result.error) return result;
      if (!firstSpawnError) firstSpawnError = result.error;
    }
  }

  const bunCandidates = currentName.includes("bun")
    ? [currentExe, "bun"]
    : ["bun"];
  for (const bunCmd of bunCandidates) {
    const result = trySpawnSync(
      bunCmd,
      ["run", cliEntryPath, ...buildArgsTail],
      {
        cwd: workdir,
        env: process.env,
        encoding: "utf8",
      },
    );
    if (!result.error) return result;
    if (!firstSpawnError) firstSpawnError = result.error;
  }

  if (firstSpawnError) throw firstSpawnError;
  throw new Error("template-dev requires Node.js(+tsx) or Bun in source checkout.");
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const RELOAD_SNIPPET = `<script id="mdsone-template-dev-reload">(function(){if(window.__mdsoneTemplateDevReload){return;}window.__mdsoneTemplateDevReload=true;var es=new EventSource('/__mdsone_dev/events');es.addEventListener('reload',function(){location.reload();});es.addEventListener('build-error',function(e){console.error('[template-dev] build-error',e.data||'');});})();</script>`;

function injectReloadScript(html) {
  if (html.includes("id=\"mdsone-template-dev-reload\"")) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${RELOAD_SNIPPET}\n</body>`);
  return `${html}\n${RELOAD_SNIPPET}`;
}

function createErrorPage(message) {
  const safe = escapeHtml(message);
  return `<!doctype html><html><head><meta charset="utf-8"/><title>template-dev build error</title><style>body{font-family:Consolas,Menlo,monospace;background:#101418;color:#f3f6fa;padding:20px}pre{white-space:pre-wrap;background:#0b0f13;border:1px solid #26303a;padding:12px;border-radius:8px}</style></head><body><h1>template-dev build error</h1><pre>${safe}</pre></body></html>`;
}

function writeSseEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${String(data ?? "")}\n\n`);
}

function collectWatchTargets(templateDir, inputs) {
  const out = new Set();
  if (fs.existsSync(templateDir)) out.add(templateDir);
  for (const input of inputs) {
    if (fs.existsSync(input)) out.add(input);
  }
  return [...out];
}

function main() {
  const parsed = parseArgv(process.argv.slice(2));
  const projectRoot = path.resolve(parsed.projectRoot || process.cwd());
  const workdir = path.resolve(parsed.workdir || process.cwd());
  const templateSpec = String(parsed.template || "normal");
  let inputs;
  if (parsed.inputs.length > 0) {
    inputs = parsed.inputs.map((x) => path.resolve(x));
    const missing = inputs.find((x) => !fs.existsSync(x));
    if (missing) {
      throw new Error(`Cannot find input file/directory: ${missing}`);
    }
  } else {
    const fallback = path.resolve(workdir, "README.md");
    ensureFileExists(
      fallback,
      "template-dev default source not found: README.md",
    );
    inputs = [fallback];
  }

  const templateDir = resolveTemplateDir(projectRoot, workdir, templateSpec);
  ensureFileExists(
    templateDir,
    `template directory not found: ${templateDir}`,
  );

  const outputDir = path.join(projectRoot, ".mdsone-template-dev");
  const outputFile = path.join(outputDir, "template.html");
  fs.mkdirSync(outputDir, { recursive: true });

  const sseClients = new Set();
  let debounceTimer = null;
  let lastBuildError = "template-dev build has not run yet.";
  let hasBuilt = false;

  function broadcast(eventName, data) {
    for (const client of sseClients) {
      writeSseEvent(client, eventName, data);
    }
  }

  function runBuild(reason) {
    const result = buildOnce({ projectRoot, workdir, templateSpec, inputs, outputFile });
    if (result.status === 0) {
      const previousBuilt = hasBuilt;
      hasBuilt = true;
      lastBuildError = "";
      if (previousBuilt) {
        broadcast("reload", reason || "changed");
      }
      return;
    }

    const out = [result.stdout || "", result.stderr || ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    const spawnError = result.error
      ? `spawn error: ${result.error.message}`
      : "";
    lastBuildError = [out, spawnError]
      .filter(Boolean)
      .join("\n")
      .trim() || `build exited with code ${result.status ?? "unknown"}`;
    console.error(`[template-dev] build failed (${reason || "manual"})`);
    if (lastBuildError) console.error(lastBuildError);
    broadcast("build-error", lastBuildError);
  }

  function scheduleBuild(reason) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runBuild(reason), 160);
  }

  const server = http.createServer((req, res) => {
    const url = req.url || "/";
    if (url.startsWith("/__mdsone_dev/events")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      sseClients.add(res);
      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    if (url === "/" || url.startsWith("/template.html")) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      if (fs.existsSync(outputFile)) {
        const html = fs.readFileSync(outputFile, "utf8");
        res.end(injectReloadScript(html));
        return;
      }
      res.end(createErrorPage(lastBuildError));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  const watchTargets = collectWatchTargets(templateDir, inputs);
  const watchers = watchTargets.map((targetPath) => {
    const stat = fs.statSync(targetPath);
    const recursive = stat.isDirectory() && process.platform === "win32";
    return fs.watch(
      targetPath,
      { recursive },
      () => scheduleBuild(`changed:${targetPath}`),
    );
  });

  runBuild("initial");

  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    const port = addr && typeof addr === "object" ? addr.port : 0;
    console.log(`Template Dev: http://127.0.0.1:${port}/template.html`);
    console.log(`[template-dev] watching: ${watchTargets.length} path(s)`);
  });

  function shutdown() {
    for (const watcher of watchers) watcher.close();
    for (const client of sseClients) client.end();
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
