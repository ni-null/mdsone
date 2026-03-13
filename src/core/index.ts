// ============================================================
// src/core/index.ts — Core 公開 API 匯出
// ============================================================

// Types
export type {
  Config,
  CliArgs,
  I18nFile,
  DocItem,
  TocConfig,
  TemplateMetadata,
  TemplateData,
  BuildParams,
  ValidationResult,
  mdsoneData,
  mdsoneDataSingle,
  mdsoneDataMulti,
  mdsoneConfigPayload,
} from "./types.js";

// Config
export { DEFAULT_CONFIG, mergeConfigs, cliArgsToConfig } from "./config.js";

// Markdown
export {
  slugify,
  escapeCodeBlocks,
  sanitizeTableCells,
  markdownToHtml,
  LOCALE_DIR_PATTERN,
} from "./markdown.js";

// i18n
export {
  getCliString,
  getTemplateString,
  getAllTemplateStrings,
  getAllLocalesTemplateStrings,
} from "./i18n.js";

// Template
export {
  generateExtraCssTags,
  generateExtraJsTags,
  assembleTemplate,
  buildExtraTags,
} from "./template.js";

// Builder
export {
  minifyHtml,
  generateDataScript,
  buildHtml,
} from "./builder.js";

// Validator
export { validateConfig } from "./validator.js";
