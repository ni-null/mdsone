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

const DEV_PLUGIN_TOGGLES = [
  { key: "code-mermaid", label: "Mermaid", env: "CODE_MERMAID" },
  { key: "code-highlight", label: "Code Highlight", env: "CODE_HIGHLIGHT" },
  { key: "katex", label: "KaTeX", env: "KATEX" },
  { key: "code-copy", label: "Code Copy", env: "CODE_COPY" },
  { key: "code-line-number", label: "Line Number", env: "CODE_LINE_NUMBER" },
  { key: "minify", label: "Minify", env: "MINIFY" },
  { key: "image", label: "Image Embed", env: "IMG_EMBED" },
];

function createDisabledPluginState() {
  const out = {};
  for (const item of DEV_PLUGIN_TOGGLES) out[item.key] = false;
  return out;
}

function sanitizeDisabledPluginState(input) {
  const next = createDisabledPluginState();
  if (!input || typeof input !== "object") return next;
  for (const item of DEV_PLUGIN_TOGGLES) {
    if (Object.prototype.hasOwnProperty.call(input, item.key)) {
      next[item.key] = !!input[item.key];
    }
  }
  return next;
}

function buildPluginEnvOverrides(disabledPlugins) {
  const env = {};
  for (const item of DEV_PLUGIN_TOGGLES) {
    if (disabledPlugins && disabledPlugins[item.key]) {
      env[item.env] = "off";
    }
  }
  return env;
}

function parseArgv(argv) {
  const out = {
    projectRoot: "",
    workdir: "",
    template: "normal",
    configPath: "",
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
    if (key === "--config" && next) {
      out.configPath = next;
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

function buildOnce({ projectRoot, workdir, templateSpec, inputs, outputFile, configPath, disabledPlugins }) {
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
    ...(configPath ? ["--config", configPath] : []),
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
          env: { ...process.env, ...buildPluginEnvOverrides(disabledPlugins) },
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
        env: { ...process.env, ...buildPluginEnvOverrides(disabledPlugins) },
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

function buildControlsSnippet() {
  const pluginsJson = JSON.stringify(DEV_PLUGIN_TOGGLES).replace(/</g, "\\u003C");
  return `<script id="mdsone-template-dev-controls">(function(){if(window.__mdsoneTemplateDevControls){return;}window.__mdsoneTemplateDevControls=true;var endpoint='/__mdsone_dev/plugin-state';var styleId='mdsone-template-dev-controls-style';var panelId='mdsone-template-dev-controls-panel';function ensureStyle(){if(document.getElementById(styleId))return;var style=document.createElement('style');style.id=styleId;style.textContent='.mdsone-dev-controls{position:fixed;left:12px;bottom:12px;z-index:2147483647;background:rgba(20,22,28,.92);color:#e8edf5;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:10px 12px;min-width:220px;backdrop-filter:blur(4px);font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.mdsone-dev-controls__title{font-weight:700;margin:0 0 8px}.mdsone-dev-controls__row{display:flex;align-items:center;gap:8px;margin:4px 0}.mdsone-dev-controls__row input{margin:0}.mdsone-dev-controls__hint{opacity:.75;margin-top:8px}';document.head.appendChild(style);}function ensurePanel(){var panel=document.getElementById(panelId);if(panel)return panel;panel=document.createElement('div');panel.id=panelId;panel.className='mdsone-dev-controls';panel.innerHTML='<div class="mdsone-dev-controls__title">Template Dev Plugins</div><div class="mdsone-dev-controls__list"></div><div class="mdsone-dev-controls__hint">Unchecked = disabled (auto rebuild)</div>';document.body.appendChild(panel);return panel;}function readState(){return fetch(endpoint,{cache:'no-store'}).then(function(res){return res.json();});}function updateState(plugin,enabled){return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plugin:plugin,enabled:enabled})}).then(function(res){return res.json();});}function render(state){var panel=ensurePanel();var list=panel.querySelector('.mdsone-dev-controls__list');if(!list)return;var disabled=(state&&state.disabled&&typeof state.disabled==='object')?state.disabled:{};var plugins=${pluginsJson};list.innerHTML='';plugins.forEach(function(item){var row=document.createElement('label');row.className='mdsone-dev-controls__row';var cb=document.createElement('input');cb.type='checkbox';cb.checked=!disabled[item.key];cb.addEventListener('change',function(){cb.disabled=true;updateState(item.key,cb.checked).then(function(next){var nextDisabled=(next&&next.disabled&&typeof next.disabled==='object')?next.disabled:{};cb.checked=!nextDisabled[item.key];}).catch(function(){cb.checked=!cb.checked;}).finally(function(){cb.disabled=false;});});var text=document.createElement('span');text.textContent=item.label;row.appendChild(cb);row.appendChild(text);list.appendChild(row);});}function init(){ensureStyle();readState().then(render).catch(function(){ensurePanel();});}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init,{once:true});}else{init();}})();</script>`;
}

function injectDevScripts(html) {
  let next = html;
  if (!next.includes('id="mdsone-template-dev-reload"')) {
    if (next.includes("</body>")) next = next.replace("</body>", `${RELOAD_SNIPPET}\n</body>`);
    else next = `${next}\n${RELOAD_SNIPPET}`;
  }

  const controls = buildControlsSnippet();
  if (!next.includes('id="mdsone-template-dev-controls"')) {
    if (next.includes("</body>")) next = next.replace("</body>", `${controls}\n</body>`);
    else next = `${next}\n${controls}`;
  }
  return next;
}

function createErrorPage(message) {
  const safe = escapeHtml(message);
  return `<!doctype html><html><head><meta charset="utf-8"/><title>template-dev build error</title><style>body{font-family:Consolas,Menlo,monospace;background:#101418;color:#f3f6fa;padding:20px}pre{white-space:pre-wrap;background:#0b0f13;border:1px solid #26303a;padding:12px;border-radius:8px}</style></head><body><h1>template-dev build error</h1><pre>${safe}</pre></body></html>`;
}

function writeSseEvent(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${String(data ?? "")}\n\n`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(JSON.stringify(payload));
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
  const configPath = parsed.configPath ? path.resolve(parsed.configPath) : "";
  if (configPath && !fs.existsSync(configPath)) {
    throw new Error(`Cannot find config file: ${configPath}`);
  }
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
  const disabledPlugins = createDisabledPluginState();

  function broadcast(eventName, data) {
    for (const client of sseClients) {
      writeSseEvent(client, eventName, data);
    }
  }

  function runBuild(reason) {
    const result = buildOnce({ projectRoot, workdir, templateSpec, inputs, outputFile, configPath, disabledPlugins });
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

    if (url.startsWith("/__mdsone_dev/plugin-state")) {
      if (req.method === "GET") {
        writeJson(res, 200, { disabled: disabledPlugins, plugins: DEV_PLUGIN_TOGGLES });
        return;
      }

      if (req.method !== "POST") {
        writeJson(res, 405, { error: "Method Not Allowed" });
        return;
      }

      readJsonBody(req).then((body) => {
        if (body && typeof body === "object" && typeof body.plugin === "string") {
          const key = body.plugin.trim();
          if (Object.prototype.hasOwnProperty.call(disabledPlugins, key)) {
            disabledPlugins[key] = body.enabled === true ? false : true;
          }
        } else if (body && typeof body === "object" && body.disabled && typeof body.disabled === "object") {
          const next = sanitizeDisabledPluginState(body.disabled);
          for (const key of Object.keys(disabledPlugins)) {
            disabledPlugins[key] = !!next[key];
          }
        }

        scheduleBuild("plugin-state-changed");
        writeJson(res, 200, { disabled: disabledPlugins, plugins: DEV_PLUGIN_TOGGLES });
      }).catch((error) => {
        writeJson(res, 400, { error: String(error?.message || error || "Invalid JSON") });
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
        res.end(injectDevScripts(html));
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
