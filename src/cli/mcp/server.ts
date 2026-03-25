// ============================================================
// src/cli/mcp/server.ts
// MCP stdio server for mdsone CLI features.
// ============================================================

import fsSync from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { CliPipelineLogger } from "../pipeline.js";
import { runCli } from "../pipeline.js";

const DEFAULT_TIMEOUT_MS = 120000;
const CAPABILITY_SUMMARY =
  "mdsone converts Markdown into self-contained HTML with modern responsive templates, built-in code syntax highlighting, footnotes, task lists, and optional i18n output.";
const TEMPLATE_HINT = "normal@default";

type CliRunResult = {
  outputPath: string | null;
  sizeBytes: number | null;
  logs: string[];
};

type ReturnMode = "path" | "inline";

function resolvePackageRoot(): string {
  if (import.meta.url) {
    try {
      const thisFile = fileURLToPath(import.meta.url);
      const dir = path.dirname(thisFile);
      if (dir.endsWith(path.join("src", "cli", "mcp"))) {
        return path.resolve(dir, "..", "..", "..");
      }
      if (dir.endsWith("dist")) {
        return path.resolve(dir, "..");
      }
      if (dir.endsWith(path.join("dist", "cli", "mcp"))) {
        return path.resolve(dir, "..", "..", "..");
      }
    } catch {
      // fallback to cwd
    }
  }
  return process.cwd();
}

function resolveTemplatesDir(): string {
  return path.join(resolvePackageRoot(), "templates");
}

async function readTemplateDetails(templateRoot: string): Promise<{
  description: string;
  version: string;
  author: string;
  default_variant: string;
  variants: string[];
}> {
  const configPath = path.join(templateRoot, "template.config.json");
  let config: unknown = {};

  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch {
    config = {};
  }

  const configObject = (config && typeof config === "object" && !Array.isArray(config))
    ? (config as Record<string, unknown>)
    : {};
  const metadataRaw = configObject._metadata;
  const runtimeRaw = configObject.config;

  const metadata = (metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw))
    ? (metadataRaw as Record<string, unknown>)
    : {};
  const runtime = (runtimeRaw && typeof runtimeRaw === "object" && !Array.isArray(runtimeRaw))
    ? (runtimeRaw as Record<string, unknown>)
    : {};

  const runtimeTypes = runtime.types;
  const variants = (runtimeTypes && typeof runtimeTypes === "object" && !Array.isArray(runtimeTypes))
    ? Object.keys(runtimeTypes as Record<string, unknown>)
    : [];
  const defaultVariant = variants.includes("default")
    ? "default"
    : (variants[0] ?? "default");

  return {
    description: typeof metadata.description === "string" ? metadata.description : "",
    version: typeof metadata.version === "string" ? metadata.version : "",
    author: typeof metadata.author === "string" ? metadata.author : "",
    default_variant: defaultVariant,
    variants,
  };
}

function summarizeTail(lines: string[], maxLines = 10): string {
  return lines.slice(-maxLines).join("\n");
}

function toJsonContent(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function ensureOutputPath(outputPath: string | null, fallbackOutputPath?: string): string {
  const resolved = outputPath ?? fallbackOutputPath ?? null;
  if (!resolved) {
    throw new Error("Unable to detect output file path from CLI output.");
  }
  return resolved;
}

async function maybeInlineHtml(outputPath: string, returnMode: ReturnMode): Promise<{ html?: string }> {
  if (returnMode !== "inline") return {};
  const html = await fs.readFile(outputPath, "utf8");
  return { html };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function runMdsoneCli(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CliRunResult> {
  const logs: string[] = [];
  let outputPath: string | null = null;
  let sizeBytes: number | null = null;

  const logger: CliPipelineLogger = {
    info(message) {
      logs.push(`[INFO] ${message}`);
    },
    warn(message) {
      logs.push(`[WARN] ${message}`);
    },
    error(message) {
      logs.push(`[ERROR] ${message}`);
    },
    outputLine(nextOutputPath, nextSizeBytes) {
      outputPath = nextOutputPath;
      sizeBytes = nextSizeBytes;
      if (nextSizeBytes === null) {
        logs.push(`[INFO] OK Output: ${nextOutputPath}`);
      } else {
        logs.push(`[INFO] OK Output: ${nextOutputPath} (${nextSizeBytes} bytes)`);
      }
    },
  };

  const cliArgv = ["node", "mdsone", ...args];
  await withTimeout(runCli(logger, cliArgv), timeoutMs, "mdsone CLI");

  return {
    outputPath,
    sizeBytes,
    logs,
  };
}

function addOptionalCommonArgs(
  args: string[],
  options: {
    template?: string;
    title?: string;
    config_path?: string;
  },
): void {
  if (options.template) args.push("--template", options.template);
  if (options.title) args.push("--title", options.title);
  if (options.config_path) args.push("--config", options.config_path);
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "mdsone",
    version: "0.1.0",
  });

  server.tool(
    "describe_capabilities",
    "Describe mdsone MCP capabilities so an agent can quickly plan Markdown-to-HTML conversion workflows without running a conversion first.",
    {},
    async () => {
      return toJsonContent({
        ok: true,
        summary: CAPABILITY_SUMMARY,
        positioning: "Markdown to self-contained HTML publishing tool (CLI-backed MCP).",
        strengths: [
          "Self-contained HTML output suitable for offline sharing.",
          "Modern responsive templates with theme variants.",
          "Built-in code syntax highlighting for code blocks.",
          "Core markdown enhancements including footnotes and task lists.",
          "Supports single-file conversion, merge mode, and i18n mode.",
        ],
        operation_modes: [
          {
            mode: "single",
            tool: "convert_single",
            when_to_use: "Convert one markdown file into one HTML document.",
          },
          {
            mode: "merge",
            tool: "convert_merge",
            when_to_use: "Merge multiple markdown files into one HTML deliverable.",
          },
          {
            mode: "i18n",
            tool: "convert_i18n",
            when_to_use: "Build one locale-aware HTML from locale folder structure.",
          },
        ],
        recommended_flow: [
          "Call `list_templates` first if visual style is unknown.",
          "Pick one of convert_single / convert_merge / convert_i18n based on source layout.",
          "Use `template` as `name` or `name@variant` (for example normal@warm-cream).",
          "Use `return_mode=path` for file-based workflows, `inline` when the model needs full HTML content.",
        ],
        defaults: {
          force: true,
          return_mode: "path",
          template_hint: TEMPLATE_HINT,
        },
        notes: [
          "The MCP server executes the same core mdsone CLI pipeline.",
          "All conversion tools return output path, file size, and summarized logs.",
        ],
      });
    },
  );

  server.tool(
    "convert_single",
    "Convert one Markdown file into a self-contained, publication-ready HTML document. The output uses mdsone's modern responsive layout and built-in syntax highlighting. Optional `template` accepts `name` or `name@variant` (for example `normal@warm-cream`).",
    {
      input_file: z.string().describe("Source markdown file path."),
      output_file: z.string().describe("Output HTML file path. If omitted, mdsone auto-generates the target path.").optional(),
      force: z.boolean().optional().default(true),
      template: z.string().describe("Optional template name or `name@variant`, for example `normal@warm-cream`.").optional(),
      title: z.string().describe("Optional site/document title embedded into the generated HTML.").optional(),
      config_path: z.string().describe("Optional config.toml path for advanced rendering behavior.").optional(),
      return_mode: z.enum(["path", "inline"]).describe("`path` returns output path metadata; `inline` also returns full HTML text.").optional().default("path"),
    },
    async (input) => {
      const args = [input.input_file];
      if (input.output_file) args.push("-o", input.output_file);
      if (input.force) args.push("-f");
      addOptionalCommonArgs(args, input);

      const result = await runMdsoneCli(args);
      const outputPath = ensureOutputPath(result.outputPath, input.output_file);
      const outputStat = await fs.stat(outputPath);
      const inlinePayload = await maybeInlineHtml(outputPath, input.return_mode);

      return toJsonContent({
        ok: true,
        mode: "single",
        output_path: outputPath,
        size_bytes: outputStat.size,
        ...inlinePayload,
        logs: summarizeTail(result.logs),
      });
    },
  );

  server.tool(
    "convert_merge",
    "Convert multiple Markdown files into one merged HTML document (single deliverable). Ideal for manuals/docs with unified modern theme and built-in syntax highlighting. Optional `template` accepts `name` or `name@variant` (for example `normal@warm-cream`).",
    {
      inputs: z.array(z.string()).min(1).describe("Input markdown files (in desired merge order)."),
      output_file: z.string().describe("Merged HTML output file path.").optional(),
      force: z.boolean().optional().default(true),
      template: z.string().describe("Optional template name or `name@variant`, for example `normal@warm-cream`.").optional(),
      title: z.string().describe("Optional site/document title embedded into the generated HTML.").optional(),
      config_path: z.string().describe("Optional config.toml path for advanced rendering behavior.").optional(),
      return_mode: z.enum(["path", "inline"]).describe("`path` returns output path metadata; `inline` also returns full HTML text.").optional().default("path"),
    },
    async (input) => {
      const args = [...input.inputs, "-m"];
      if (input.output_file) args.push("-o", input.output_file);
      if (input.force) args.push("-f");
      addOptionalCommonArgs(args, input);

      const result = await runMdsoneCli(args);
      const outputPath = ensureOutputPath(result.outputPath, input.output_file);
      const outputStat = await fs.stat(outputPath);
      const inlinePayload = await maybeInlineHtml(outputPath, input.return_mode);

      return toJsonContent({
        ok: true,
        mode: "merge",
        output_path: outputPath,
        size_bytes: outputStat.size,
        ...inlinePayload,
        logs: summarizeTail(result.logs),
      });
    },
  );

  server.tool(
    "convert_i18n",
    "Convert a locale-structured Markdown docs folder into one i18n HTML site (single file with locale-aware content). Includes modern responsive layout and syntax highlighting. Optional `template` accepts `name` or `name@variant` (for example `normal@warm-cream`).",
    {
      input_dir: z.string().describe("Root docs directory that contains locale subfolders."),
      output_file: z.string().describe("Output HTML file path for i18n result.").optional(),
      default_locale: z.string().describe("Default locale to open when the page loads.").optional().default("en"),
      force: z.boolean().optional().default(true),
      template: z.string().describe("Optional template name or `name@variant`, for example `normal@warm-cream`.").optional(),
      title: z.string().describe("Optional site/document title embedded into the generated HTML.").optional(),
      config_path: z.string().describe("Optional config.toml path for advanced rendering behavior.").optional(),
      return_mode: z.enum(["path", "inline"]).describe("`path` returns output path metadata; `inline` also returns full HTML text.").optional().default("path"),
    },
    async (input) => {
      const args = [input.input_dir, `--i18n-mode=${input.default_locale}`];
      if (input.output_file) args.push("-o", input.output_file);
      if (input.force) args.push("-f");
      addOptionalCommonArgs(args, input);

      const result = await runMdsoneCli(args);
      const outputPath = ensureOutputPath(result.outputPath, input.output_file);
      const outputStat = await fs.stat(outputPath);
      const inlinePayload = await maybeInlineHtml(outputPath, input.return_mode);

      return toJsonContent({
        ok: true,
        mode: "i18n",
        output_path: outputPath,
        size_bytes: outputStat.size,
        ...inlinePayload,
        logs: summarizeTail(result.logs),
      });
    },
  );

  server.tool(
    "list_templates",
    "List available mdsone visual templates/themes for Markdown-to-HTML publishing, including variants and `name@variant` examples.",
    {},
    async () => {
      const templatesDir = resolveTemplatesDir();
      if (!fsSync.existsSync(templatesDir)) {
        throw new Error(`Templates directory not found: ${templatesDir}`);
      }

      const entries = await fs.readdir(templatesDir, { withFileTypes: true });
      const templates: string[] = [];
      const templateDetails: Array<{
        name: string;
        description: string;
        version: string;
        author: string;
        default_variant: string;
        variants: string[];
        template_arg_examples: string[];
      }> = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const templateRoot = path.join(templatesDir, entry.name);
        const assetsStylePath = path.join(templateRoot, "assets", "style.css");
        const htmlPath = path.join(templateRoot, "template.html");

        try {
          await fs.access(assetsStylePath);
          await fs.access(htmlPath);
          templates.push(entry.name);

          const details = await readTemplateDetails(templateRoot);
          templateDetails.push({
            name: entry.name,
            description: details.description,
            version: details.version,
            author: details.author,
            default_variant: details.default_variant,
            variants: details.variants,
            template_arg_examples: details.variants.length > 0
              ? details.variants.map((variant) => `${entry.name}@${variant}`)
              : [entry.name],
          });
        } catch {
          // Skip non-template folders.
        }
      }

      templates.sort((a, b) => a.localeCompare(b));
      templateDetails.sort((a, b) => a.name.localeCompare(b.name));

      return toJsonContent({
        ok: true,
        templates,
        template_count: templates.length,
        template_details: templateDetails,
        capabilities_summary: CAPABILITY_SUMMARY,
        usage_hint: "Use the `template` argument as `name` or `name@variant`, for example `normal@warm-cream`.",
      });
    },
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mdsone] MCP server running (stdio)");
}
