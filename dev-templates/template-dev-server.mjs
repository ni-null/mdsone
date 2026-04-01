#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import * as toml from "@iarna/toml";

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
  { key: "code-mermaid", label: "Mermaid", env: "CODE_MERMAID", defaultEnabled: true, onValue: "on", offValue: "off" },
  { key: "code-highlight", label: "Code Highlight", env: "CODE_HIGHLIGHT", defaultEnabled: true, onValue: "on", offValue: "off" },
  { key: "katex", label: "KaTeX", env: "KATEX", defaultEnabled: true, onValue: "on", offValue: "off" },
  { key: "code-copy", label: "Code Copy", env: "CODE_COPY", defaultEnabled: true, onValue: "line", offValue: "off" },
  { key: "code-line-number", label: "Line Number", env: "CODE_LINE_NUMBER", defaultEnabled: false, onValue: "on", offValue: "off" },
  { key: "minify", label: "Minify", env: "MINIFY", defaultEnabled: false, onValue: "on", offValue: "off" },
  { key: "image", label: "Image Embed", env: "IMG_EMBED", defaultEnabled: false, onValue: "base64", offValue: "off" },
];

function createPluginOverrideState() {
  const out = {};
  for (const item of DEV_PLUGIN_TOGGLES) out[item.key] = "inherit";
  return out;
}

function sanitizePluginOverrideState(input) {
  const next = createPluginOverrideState();
  if (!input || typeof input !== "object") return next;
  for (const item of DEV_PLUGIN_TOGGLES) {
    if (Object.prototype.hasOwnProperty.call(input, item.key)) {
      const raw = input[item.key];
      if (raw === "on" || raw === "off" || raw === "inherit") next[item.key] = raw;
      else if (raw === true) next[item.key] = "on";
      else if (raw === false) next[item.key] = "off";
    }
  }
  return next;
}

function buildPluginEnvOverrides(pluginOverrides) {
  const env = {};
  for (const item of DEV_PLUGIN_TOGGLES) {
    const mode = pluginOverrides ? pluginOverrides[item.key] : "inherit";
    if (mode === "off") {
      env[item.env] = item.offValue;
    } else if (mode === "on") {
      env[item.env] = item.onValue;
    }
  }
  return env;
}

function parseBooleanLike(raw) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "y", "on"].includes(value)) return true;
  if (["0", "false", "no", "n", "off"].includes(value)) return false;
  return undefined;
}

function parseEnumLike(raw, allowed) {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  return allowed.includes(value) ? value : undefined;
}

function resolveConfigFileForDevState(configPath, workdir) {
  if (configPath && fs.existsSync(configPath)) return configPath;
  const fallback = path.join(workdir, "config.toml");
  if (fs.existsSync(fallback)) return fallback;
  return "";
}

function readTomlPluginConfig(configFilePath) {
  if (!configFilePath || !fs.existsSync(configFilePath)) return {};
  try {
    let raw = fs.readFileSync(configFilePath, "utf8");
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const parsed = toml.parse(raw);
    const plugins = (parsed && typeof parsed === "object" ? parsed.plugins : null);
    if (!plugins || typeof plugins !== "object") return {};
    return plugins;
  } catch {
    return {};
  }
}

function evaluatePluginEnabled(item, pluginConfigEntry, envValue) {
  const key = item.key;

  if (key === "code-mermaid") {
    let enabled = typeof pluginConfigEntry?.enable === "boolean" ? pluginConfigEntry.enable : true;
    const envBool = parseBooleanLike(envValue);
    if (envBool !== undefined) enabled = envBool;
    else {
      const mode = parseEnumLike(envValue, ["on", "off"]);
      if (mode === "on") enabled = true;
      else if (mode === "off") enabled = false;
    }
    return enabled;
  }

  if (key === "code-highlight") {
    let enabled = typeof pluginConfigEntry?.enable === "boolean" ? pluginConfigEntry.enable : true;
    const envBool = parseBooleanLike(envValue);
    if (envBool !== undefined) enabled = envBool;
    else {
      const mode = parseEnumLike(envValue, ["on", "off"]);
      if (mode === "on") enabled = true;
      else if (mode === "off") enabled = false;
    }
    return enabled;
  }

  if (key === "katex") {
    let enabled = pluginConfigEntry?.enable !== false;
    const envBool = parseBooleanLike(envValue);
    if (envBool !== undefined) enabled = envBool;
    else {
      const mode = parseEnumLike(envValue, ["on", "off", "full", "woff2"]);
      if (mode === "off") enabled = false;
      else if (mode === "on" || mode === "full" || mode === "woff2") enabled = true;
    }
    return enabled;
  }

  if (key === "code-copy") {
    let enabled = typeof pluginConfigEntry?.enable === "boolean" ? pluginConfigEntry.enable : true;
    const configMode = parseEnumLike(pluginConfigEntry?.mode, ["off", "line", "cmd", "none"]) ?? "none";
    let mode = configMode;
    const envMode = parseEnumLike(envValue, ["off", "line", "cmd"]);
    if (envMode) {
      enabled = envMode !== "off";
      mode = envMode;
    }
    return enabled && mode !== "off";
  }

  if (key === "code-line-number") {
    let enabled = pluginConfigEntry?.enable === true;
    const envBool = parseBooleanLike(envValue);
    if (envBool !== undefined) enabled = envBool;
    else {
      const mode = parseEnumLike(envValue, ["on", "off"]);
      if (mode === "on") enabled = true;
      else if (mode === "off") enabled = false;
    }
    return enabled;
  }

  if (key === "minify") {
    let enabled = pluginConfigEntry?.enable === true;
    const envBool = parseBooleanLike(envValue);
    if (envBool !== undefined) enabled = envBool;
    else {
      const mode = parseEnumLike(envValue, ["on", "off"]);
      if (mode === "on") enabled = true;
      else if (mode === "off") enabled = false;
    }
    return enabled;
  }

  if (key === "image") {
    let embed = parseEnumLike(pluginConfigEntry?.embed, ["off", "base64"]);
    if (!embed && typeof pluginConfigEntry?.base64_embed === "boolean") {
      embed = pluginConfigEntry.base64_embed ? "base64" : "off";
    }
    if (!embed) embed = "off";

    const envMode = parseEnumLike(envValue, ["off", "base64"]);
    if (envMode) embed = envMode;
    return embed === "base64";
  }

  return !!item.defaultEnabled;
}

function resolveEffectivePluginState({ configPath, workdir, pluginOverrides }) {
  const configFilePath = resolveConfigFileForDevState(configPath, workdir);
  const pluginsFromToml = readTomlPluginConfig(configFilePath);
  const overrideEnv = buildPluginEnvOverrides(pluginOverrides);
  const enabled = {};
  const disabled = {};
  const source = {};

  for (const item of DEV_PLUGIN_TOGGLES) {
    const pluginCfg = pluginsFromToml?.[item.key];
    const envValue = Object.prototype.hasOwnProperty.call(overrideEnv, item.env)
      ? overrideEnv[item.env]
      : process.env[item.env];
    const on = evaluatePluginEnabled(item, pluginCfg, envValue);
    enabled[item.key] = !!on;
    disabled[item.key] = !on;
    source[item.key] = pluginOverrides[item.key] || "inherit";
  }

  return { enabled, disabled, source };
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

function buildOnce({ projectRoot, workdir, templateSpec, inputs, outputFile, configPath, pluginOverrides }) {
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
          env: { ...process.env, ...buildPluginEnvOverrides(pluginOverrides) },
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
        env: { ...process.env, ...buildPluginEnvOverrides(pluginOverrides) },
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
  return `<script id="mdsone-template-dev-controls">(function(){if(window.__mdsoneTemplateDevControls){return;}window.__mdsoneTemplateDevControls=true;var endpoint='/__mdsone_dev/plugin-state';var styleId='mdsone-template-dev-controls-style';var panelId='mdsone-template-dev-controls-panel';var storageKey='mdsone-template-dev-controls-collapsed';function ensureStyle(){if(document.getElementById(styleId))return;var style=document.createElement('style');style.id=styleId;style.textContent='.mdsone-dev-controls{position:fixed;left:12px;bottom:12px;z-index:2147483647;background:rgba(20,22,28,.92);color:#e8edf5;border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:10px 12px;min-width:220px;backdrop-filter:blur(4px);font:12px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.mdsone-dev-controls__header{display:flex;align-items:center;justify-content:space-between;gap:8px}.mdsone-dev-controls__title{font-weight:700;margin:0}.mdsone-dev-controls__toggle{appearance:none;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:inherit;border-radius:6px;padding:2px 8px;font:inherit;line-height:1.3;cursor:pointer}.mdsone-dev-controls__toggle:hover{background:rgba(255,255,255,.14)}.mdsone-dev-controls__body{margin-top:8px}.mdsone-dev-controls.is-collapsed .mdsone-dev-controls__body{display:none}.mdsone-dev-controls__row{display:flex;align-items:center;gap:8px;margin:4px 0}.mdsone-dev-controls__row input{margin:0}.mdsone-dev-controls__hint{opacity:.75;margin-top:8px}';document.head.appendChild(style);}function readCollapsed(){try{return localStorage.getItem(storageKey)==='1';}catch(_e){return false;}}function writeCollapsed(collapsed){try{localStorage.setItem(storageKey,collapsed?'1':'0');}catch(_e){}}function applyCollapsed(panel,collapsed){if(!(panel instanceof HTMLElement))return;panel.classList.toggle('is-collapsed',!!collapsed);var toggle=panel.querySelector('.mdsone-dev-controls__toggle');if(toggle instanceof HTMLButtonElement){toggle.textContent=collapsed?'Expand':'Collapse';toggle.setAttribute('aria-expanded',collapsed?'false':'true');toggle.setAttribute('title',collapsed?'Expand panel':'Collapse panel');}}function ensurePanel(){var panel=document.getElementById(panelId);if(panel)return panel;panel=document.createElement('div');panel.id=panelId;panel.className='mdsone-dev-controls';panel.innerHTML='<div class=\"mdsone-dev-controls__header\"><div class=\"mdsone-dev-controls__title\">Template Dev Plugins</div><button type=\"button\" class=\"mdsone-dev-controls__toggle\" aria-label=\"Toggle plugin panel\">Collapse</button></div><div class=\"mdsone-dev-controls__body\"><div class=\"mdsone-dev-controls__list\"></div><div class=\"mdsone-dev-controls__hint\">Checked = enabled in actual build state</div></div>';document.body.appendChild(panel);var toggle=panel.querySelector('.mdsone-dev-controls__toggle');if(toggle instanceof HTMLButtonElement){toggle.addEventListener('click',function(){var collapsed=!panel.classList.contains('is-collapsed');applyCollapsed(panel,collapsed);writeCollapsed(collapsed);});}applyCollapsed(panel,readCollapsed());return panel;}function readState(){return fetch(endpoint,{cache:'no-store'}).then(function(res){return res.json();});}function updateState(plugin,enabled){return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plugin:plugin,enabled:enabled})}).then(function(res){return res.json();});}function render(state){var panel=ensurePanel();var list=panel.querySelector('.mdsone-dev-controls__list');if(!list)return;var enabled=(state&&state.enabled&&typeof state.enabled==='object')?state.enabled:{};var plugins=${pluginsJson};list.innerHTML='';plugins.forEach(function(item){var row=document.createElement('label');row.className='mdsone-dev-controls__row';var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!enabled[item.key];cb.addEventListener('change',function(){cb.disabled=true;updateState(item.key,cb.checked).then(function(next){var nextEnabled=(next&&next.enabled&&typeof next.enabled==='object')?next.enabled:{};cb.checked=!!nextEnabled[item.key];}).catch(function(){cb.checked=!cb.checked;}).finally(function(){cb.disabled=false;});});var text=document.createElement('span');text.textContent=item.label;row.appendChild(cb);row.appendChild(text);list.appendChild(row);});}function init(){ensureStyle();readState().then(render).catch(function(){ensurePanel();});}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init,{once:true});}else{init();}})();</script>`;
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

function collectWatchTargets(templateDir, inputs, configPath) {
  const out = new Set();
  if (fs.existsSync(templateDir)) out.add(templateDir);
  for (const input of inputs) {
    if (fs.existsSync(input)) out.add(input);
  }
  if (configPath && fs.existsSync(configPath)) out.add(configPath);
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
  const pluginOverrides = createPluginOverrideState();

  function broadcast(eventName, data) {
    for (const client of sseClients) {
      writeSseEvent(client, eventName, data);
    }
  }

  function runBuild(reason) {
    const result = buildOnce({ projectRoot, workdir, templateSpec, inputs, outputFile, configPath, pluginOverrides });
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
        const effective = resolveEffectivePluginState({ configPath, workdir, pluginOverrides });
        writeJson(res, 200, { ...effective, plugins: DEV_PLUGIN_TOGGLES });
        return;
      }

      if (req.method !== "POST") {
        writeJson(res, 405, { error: "Method Not Allowed" });
        return;
      }

      readJsonBody(req).then((body) => {
        if (body && typeof body === "object" && typeof body.plugin === "string") {
          const key = body.plugin.trim();
          if (Object.prototype.hasOwnProperty.call(pluginOverrides, key)) {
            pluginOverrides[key] = body.enabled === true ? "on" : "off";
          }
        } else if (body && typeof body === "object" && body.overrides && typeof body.overrides === "object") {
          const next = sanitizePluginOverrideState(body.overrides);
          for (const key of Object.keys(pluginOverrides)) {
            pluginOverrides[key] = next[key];
          }
        } else if (body && typeof body === "object" && body.disabled && typeof body.disabled === "object") {
          // Legacy payload: disabled=true means force off; false means inherit.
          for (const key of Object.keys(pluginOverrides)) {
            if (!Object.prototype.hasOwnProperty.call(body.disabled, key)) continue;
            pluginOverrides[key] = body.disabled[key] === true ? "off" : "inherit";
          }
        }

        scheduleBuild("plugin-state-changed");
        const effective = resolveEffectivePluginState({ configPath, workdir, pluginOverrides });
        writeJson(res, 200, { ...effective, plugins: DEV_PLUGIN_TOGGLES });
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

  const watchTargets = collectWatchTargets(templateDir, inputs, resolveConfigFileForDevState(configPath, workdir));
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
