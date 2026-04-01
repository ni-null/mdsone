// ============================================================
// src/plugins/option-specs.ts
// Plugin option specs for CLI/ENV -> Partial<Config> mapping.
// ============================================================

import type { CliProgram, Config } from "../core/types.js";
import { parseBooleanLike, parseEnumLike, parseIntegerLike } from "../core/value-parsers.js";

type CliParser = (raw: string) => unknown;

type PluginCliOption = {
  flags: string;
  description: string;
  parser?: CliParser;
};

type PluginOptionSpec = {
  pluginName: string;
  cli?: PluginCliOption[];
  cliToConfig?: (opts: Record<string, unknown>, out: Partial<Config>) => void;
  envToConfig?: (env: NodeJS.ProcessEnv, out: Partial<Config>) => void;
};

function ensurePluginConfig(
  out: Partial<Config>,
  pluginName: string,
): Record<string, unknown> {
  const previousPlugins = out.plugins ?? {};
  const previousConfig = previousPlugins.config ?? {};
  const previousPluginConfig = (previousConfig[pluginName] ?? {}) as Record<string, unknown>;
  const nextPluginConfig = { ...previousPluginConfig };
  out.plugins = {
    ...previousPlugins,
    config: {
      ...previousConfig,
      [pluginName]: nextPluginConfig,
    },
  };
  return nextPluginConfig;
}

function parseRequiredEnum(raw: string, allowed: readonly string[], flag: string): string {
  const parsed = parseEnumLike(raw, allowed);
  if (parsed !== undefined) return parsed;
  throw new Error(`Invalid value for ${flag}. Use ${allowed.join("|")}.`);
}

export const pluginOptionSpecs: PluginOptionSpec[] = [
  {
    pluginName: "image",
    cli: [
      {
        flags: "--img-embed <off|base64>",
        description: "Image embedding mode (use --img-embed=base64|off)",
        parser: (raw: string) => parseRequiredEnum(raw, ["off", "base64"] as const, "--img-embed"),
      },
      {
        flags: "--img-max-width <pixels>",
        description: "Max image width in pixels (requires 'sharp' package)",
      },
      {
        flags: "--img-compress <1-100>",
        description: "Image compression quality 1-100 (requires 'sharp' package)",
      },
    ],
    cliToConfig(opts, out) {
      const rawEmbed = opts["imgEmbed"];
      const rawMaxWidth = opts["imgMaxWidth"];
      const rawCompress = opts["imgCompress"];

      const embed = parseEnumLike(rawEmbed, ["off", "base64"] as const);
      const maxWidth = parseIntegerLike(rawMaxWidth);
      const compress = parseIntegerLike(rawCompress);

      const hasEmbed = embed !== undefined;
      const hasMaxWidth = maxWidth !== undefined && maxWidth > 0;
      const hasCompress = compress !== undefined;
      if (!hasEmbed && !hasMaxWidth && !hasCompress) return;

      const image = ensurePluginConfig(out, "image");
      if (hasEmbed) image["embed"] = embed;
      if (hasMaxWidth) image["max_width"] = maxWidth;
      if (hasCompress) image["compress"] = Math.max(1, Math.min(100, compress!));
    },
    envToConfig(env, out) {
      const embed = parseEnumLike(env["IMG_EMBED"], ["off", "base64"] as const);
      const maxWidth = parseIntegerLike(env["IMG_MAX_WIDTH"]);
      const compress = parseIntegerLike(env["IMG_COMPRESS"]);

      const hasEmbed = embed !== undefined;
      const hasMaxWidth = maxWidth !== undefined && maxWidth > 0;
      const hasCompress = compress !== undefined;
      if (!hasEmbed && !hasMaxWidth && !hasCompress) return;

      const image = ensurePluginConfig(out, "image");
      if (hasEmbed) image["embed"] = embed;
      if (hasMaxWidth) image["max_width"] = maxWidth;
      if (hasCompress) image["compress"] = Math.max(1, Math.min(100, compress!));
    },
  },
  {
    pluginName: "katex",
    cli: [
      {
        flags: "--katex [mode]",
        description: "KaTeX mode (auto default; --katex=full for full fonts; --katex=off to disable)",
        parser: (raw: string) => {
          const parsed = parseEnumLike(raw, ["full", "off"] as const);
          if (parsed !== undefined) return parsed;
          throw new Error("Invalid value for --katex. Use --katex, --katex=full, or --katex=off.");
        },
      },
    ],
    cliToConfig(opts, out) {
      const raw = opts["katex"];
      if (raw !== true && raw !== "full" && raw !== "off") return;
      const katex = ensurePluginConfig(out, "katex");
      katex["enable"] = raw !== "off";
      katex["mode"] = raw === "full" ? "full" : "woff2";
    },
    envToConfig(env, out) {
      const raw = env["KATEX"];
      if (raw === undefined) return;

      let enable = parseBooleanLike(raw);
      let mode: "woff2" | "full" = "woff2";
      if (enable === undefined) {
        const parsed = parseEnumLike(raw, ["off", "on", "full", "woff2"] as const);
        if (parsed === undefined) return;
        if (parsed === "off") {
          enable = false;
          mode = "woff2";
        } else if (parsed === "full") {
          enable = true;
          mode = "full";
        } else {
          enable = true;
          mode = "woff2";
        }
      }

      const katex = ensurePluginConfig(out, "katex");
      katex["enable"] = enable;
      katex["mode"] = mode;
    },
  },
  {
    pluginName: "code-highlight",
    cli: [
      {
        flags: "--code-highlight <off>",
        description: "Disable syntax highlighting (use --code-highlight=off)",
        parser: (raw: string) => {
          const parsed = parseEnumLike(raw, ["off"] as const);
          if (parsed !== undefined) return parsed;
          throw new Error("Invalid value for --code-highlight. Use off.");
        },
      },
    ],
    cliToConfig(opts, out) {
      const raw = opts["codeHighlight"];
      if (String(raw ?? "").toLowerCase() !== "off") return;
      const codeHighlight = ensurePluginConfig(out, "code-highlight");
      codeHighlight["enable"] = false;
    },
    envToConfig(env, out) {
      const raw = env["CODE_HIGHLIGHT"];
      if (raw === undefined) return;

      let enable = parseBooleanLike(raw);
      if (enable === undefined) {
        const mode = parseEnumLike(raw, ["off", "on"] as const);
        if (mode === undefined) return;
        enable = mode === "on";
      }

      const codeHighlight = ensurePluginConfig(out, "code-highlight");
      codeHighlight["enable"] = enable;
    },
  },
  {
    pluginName: "code-mermaid",
    cli: [
      {
        flags: "--code-mermaid <off>",
        description: "Disable Mermaid diagram rendering (use --code-mermaid=off)",
        parser: (raw: string) => {
          const parsed = parseEnumLike(raw, ["off"] as const);
          if (parsed !== undefined) return parsed;
          throw new Error("Invalid value for --code-mermaid. Use off.");
        },
      },
    ],
    cliToConfig(opts, out) {
      const raw = opts["codeMermaid"];
      if (String(raw ?? "").toLowerCase() !== "off") return;
      const codeMermaid = ensurePluginConfig(out, "code-mermaid");
      codeMermaid["enable"] = false;
    },
    envToConfig(env, out) {
      const raw = env["CODE_MERMAID"];
      if (raw === undefined) return;

      let enable = parseBooleanLike(raw);
      if (enable === undefined) {
        const mode = parseEnumLike(raw, ["off", "on"] as const);
        if (mode === undefined) return;
        enable = mode === "on";
      }

      const codeMermaid = ensurePluginConfig(out, "code-mermaid");
      codeMermaid["enable"] = enable;
    },
  },

  {
    pluginName: "code-copy",
    cli: [
      {
        flags: "--code-copy <off|line|cmd>",
        description: "Copy button mode (use --code-copy=off|line|cmd)",
        parser: (raw: string) => parseRequiredEnum(raw, ["off", "line", "cmd"] as const, "--code-copy"),
      },
    ],
    cliToConfig(opts, out) {
      const mode = parseEnumLike(opts["codeCopy"], ["off", "line", "cmd"] as const);
      if (mode === undefined) return;
      const codeCopy = ensurePluginConfig(out, "code-copy");
      codeCopy["enable"] = mode !== "off";
      codeCopy["mode"] = mode;
    },
    envToConfig(env, out) {
      const mode = parseEnumLike(env["CODE_COPY"], ["off", "line", "cmd"] as const);
      if (mode === undefined) return;
      const codeCopy = ensurePluginConfig(out, "code-copy");
      codeCopy["enable"] = mode !== "off";
      codeCopy["mode"] = mode;
    },
  },
  {
    pluginName: "code-line-number",
    cli: [
      {
        flags: "--code-line-number [off]",
        description: "Show line numbers in code blocks (use --code-line-number or --code-line-number=off)",
        parser: (raw: string) => {
          const parsed = parseEnumLike(raw, ["off"] as const);
          if (parsed !== undefined) return parsed;
          throw new Error("Invalid value for --code-line-number. Use off.");
        },
      },
    ],
    cliToConfig(opts, out) {
      const raw = opts["codeLineNumber"];
      if (raw !== true && raw !== "off") return;
      const lineNumber = ensurePluginConfig(out, "code-line-number");
      lineNumber["enable"] = raw === true;
    },
    envToConfig(env, out) {
      const raw = env["CODE_LINE_NUMBER"];
      if (raw === undefined) return;

      let enable = parseBooleanLike(raw);
      if (enable === undefined) {
        const mode = parseEnumLike(raw, ["off", "on"] as const);
        if (mode === undefined) return;
        enable = mode === "on";
      }
      const lineNumber = ensurePluginConfig(out, "code-line-number");
      lineNumber["enable"] = enable;
    },
  },
  {
    pluginName: "minify",
    cli: [
      {
        flags: "--minify [off]",
        description: "Minify output HTML (default: off; use --minify or --minify=off)",
        parser: (raw: string) => {
          const parsed = parseEnumLike(raw, ["off"] as const);
          if (parsed !== undefined) return parsed;
          throw new Error("Invalid value for --minify. Use --minify or --minify=off.");
        },
      },
    ],
    cliToConfig(opts, out) {
      const raw = opts["minify"];
      if (raw !== true && raw !== "off") return;
      const minify = ensurePluginConfig(out, "minify");
      minify["enable"] = raw === true;
    },
    envToConfig(env, out) {
      const raw = env["MINIFY"];
      if (raw === undefined) return;

      let enable = parseBooleanLike(raw);
      if (enable === undefined) {
        const mode = parseEnumLike(raw, ["off", "on"] as const);
        if (mode === undefined) return;
        enable = mode === "on";
      }
      const minify = ensurePluginConfig(out, "minify");
      minify["enable"] = enable;
    },
  },
];

export function registerPluginCliOptions(program: CliProgram): void {
  for (const spec of pluginOptionSpecs) {
    for (const option of spec.cli ?? []) {
      if (option.parser) {
        program.option(option.flags, option.description, option.parser);
      } else {
        program.option(option.flags, option.description);
      }
    }
  }
}

export function applyPluginCliToConfig(
  opts: Record<string, unknown>,
  out: Partial<Config>,
): void {
  for (const spec of pluginOptionSpecs) {
    spec.cliToConfig?.(opts, out);
  }
}

export function applyPluginEnvToConfig(
  env: NodeJS.ProcessEnv,
  out: Partial<Config>,
): void {
  for (const spec of pluginOptionSpecs) {
    spec.envToConfig?.(env, out);
  }
}
