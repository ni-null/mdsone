# MDSone Plugin 架构规划书

> 创建日期：2026-03-14
> 目的：将可选功能模组化，便于扩展和维护

---

## 1. 背景与目标

### 当前问题

- `lib/` 目录混合了静态资源（highlight CSS、copy JS）
- 图片转 base64 逻辑耦合在 `src/adapters/node/fs.ts` 中
- 每新增一个功能需要修改主程式 `main.ts`
- 功能之间没有明确的边界

### 目标

- 将 `highlight`、`copy`、`image-embed` 三个功能独立为 plugin
- plugin 可声明自己的默认开启状态和默认参数
- 主程序按顺序调用各 plugin，收集 assets 统一注入
- 便于后续扩展新功能

---

## 2. 设计原则

| 原则 | 说明 |
|------|------|
| **单一职责** | 每个 plugin 只负责一个功能 |
| **声明式配置** | plugin 声明默认参数和开启状态，主程序读取 |
| **顺序执行** | plugin 按依赖顺序执行（如 image-embed 需要在 HTML 生成后处理） |
| **资源收集** | 所有 plugin 的 CSS/JS 统一收集后注入输出 HTML |

---

## 3. 目录结构

### 规划后

```
mdsone/
├── plugins/                              # 所有插件
│   ├── highlight/                       # 语法高亮
│   │   ├── index.ts                    # 入口：导出 plugin 定义
│   │   ├── themes/                     # 主题 CSS
│   │   │   ├── atom-one-dark.css
│   │   │   └── atom-one-light.css
│   │   └── runtime/                    # 运行时 JS
│   │       └── theme-switcher.ts
│   ├── copy/                           # 复制按钮
│   │   ├── index.ts
│   │   └── copy-button.ts
│   └── image-embed/                    # 图片嵌入 base64
│       ├── index.ts                    # embedImagesInHtml 逻辑
│       └── fetch-image.ts              # 远端图片获取
│
├── lib/                                 # 待删除（旧结构）
│   ├── highlight/                      # ❌ 删除
│   └── copy/                           # ❌ 删除
│
├── src/
│   ├── plugin-manager.ts               # 插件管理器（新增）
│   ├── core/
│   ├── adapters/
│   └── cli/
│
├── templates/                          # 模板（保持不变）
└── locales/                           # 语系文件（保持不变）
```

---

## 4. Plugin 接口定义

### 4.1 Plugin 结构

```typescript
import type { Config } from "../core/types.js";

export interface PluginAssets {
  css?: string;    // 注入到 {LIB_CSS}
  js?: string;    // 注入到 {LIB_JS}
}

export interface Plugin {
  // ===== 元信息 =====
  name: string;                           // plugin 名称（如 "highlight"）
  enabledByDefault: boolean;              // 是否默认开启

  // ===== 默认配置 =====
  defaultConfig: Partial<Config>;         // 默认参数（会合并到主 config）

  // ===== 生命周期 =====
  
  /**
   * HTML 处理阶段
   * @param html - 当前 HTML 字符串
   * @param config - 完整配置对象
   * @returns 处理后的 HTML
   */
  processHtml?: (html: string, config: Config) => string | Promise<string>;

  /**
   * 获取需要注入到输出 HTML 的资源
   * @param config - 完整配置对象
   * @returns CSS/JS 字符串
   */
  getAssets?: (config: Config) => PluginAssets | Promise<PluginAssets>;

  /**
   * 验证配置（可选）
   * @param config - 完整配置对象
   * @returns 错误信息数组
   */
  validateConfig?: (config: Config) => string[];
}
```

### 4.2 Plugin 导出约定

每个 plugin 的 `index.ts` 需导出 `plugin` 对象：

```typescript
// plugins/highlight/index.ts
import type { Plugin } from "../../plugin-manager.js";
import { themeSwitcher } from "./runtime/theme-switcher.js";

export const highlight: Plugin = {
  name: "highlight",
  enabledByDefault: true,

  defaultConfig: {
    code_highlight: true,
    code_highlight_theme: "atom-one-dark",
    code_highlight_theme_light: "atom-one-light",
  },

  getAssets: (config) => {
    if (!config.code_highlight) return {};
    // 读取主题 CSS、组装 runtime JS
    return { css: "...", js: "..." };
  },
};
```

---

## 5. Plugin Manager 设计

### 5.1 核心职责

| 职责 | 说明 |
|------|------|
| **加载 plugin** | 扫描 `plugins/` 目录或静态导入 |
| **合并配置** | 收集所有 plugin 的 `defaultConfig` 合并到主 config |
| **执行处理** | 按顺序调用各 plugin 的 `processHtml()` |
| **收集资源** | 收集所有 plugin 的 `getAssets()` 统一注入 |

### 5.2 执行流程

```
main.ts
  │
  ├─> pluginManager.load()          // 加载所有 plugin
  │     ├─> 扫描 plugins/ 目录
  │     ├─> 导入各 plugin/index.ts
  │     └─> 收集 defaultConfig
  │
  ├─> buildConfig()                 // 合并配置
  │     └─> pluginManager.mergeDefaults(config)
  │
  ├─> markdownToHtml()              // 生成 HTML
  │
  ├─> pluginManager.processHtml()   // 各 plugin 处理 HTML
  │     ├─> image-embed.processHtml(html)
  │     ├─> highlight.processHtml(html)   // 如有需要
  │     └─> ...
  │
  ├─> pluginManager.getAssets()     // 收集资源
  │     ├─> highlight.getAssets()
  │     ├─> copy.getAssets()
  │     └─> ...
  │
  └─> buildHtml()                   // 最终组装
```

### 5.3 代码设计

```typescript
// src/plugin-manager.ts

import type { Config, Plugin, PluginAssets } from "./core/types.js";
import { highlightPlugin } from "./plugins/highlight/index.js";
import { copyPlugin } from "./plugins/copy/index.js";
import { imageEmbedPlugin } from "./plugins/image-embed/index.js";

const builtInPlugins: Plugin[] = [
  imageEmbedPlugin,   // 先处理图片（依赖 HTML 结构）
  highlightPlugin,    // 再高亮代码
  copyPlugin,         // 最后添加复制按钮
];

export class PluginManager {
  private plugins: Plugin[] = [];

  constructor() {
    this.register(builtInPlugins);
  }

  register(plugins: Plugin[]) {
    this.plugins.push(...plugins);
  }

  /** 收集所有 plugin 的默认配置 */
  getDefaultConfig(): Partial<Config> {
    const defaults: Partial<Config> = {};
    for (const plugin of this.plugins) {
      if (plugin.enabledByDefault && plugin.defaultConfig) {
        Object.assign(defaults, plugin.defaultConfig);
      }
    }
    return defaults;
  }

  /** 判断某 plugin 是否启用 */
  isEnabled(pluginName: string, config: Config): boolean {
    const plugin = this.plugins.find((p) => p.name === pluginName);
    if (!plugin) return false;
    // 检查 config 中的对应开关（如 code_highlight、code_copy、img_to_base64）
    switch (pluginName) {
      case "highlight": return config.code_highlight;
      case "copy": return config.code_copy;
      case "image-embed": return config.img_to_base64;
      default: return false;
    }
  }

  /** 按顺序执行所有启用的 plugin 的 processHtml */
  async processHtml(html: string, config: Config): Promise<string> {
    let result = html;
    for (const plugin of this.plugins) {
      if (this.isEnabled(plugin.name, config) && plugin.processHtml) {
        result = await plugin.processHtml(result, config);
      }
    }
    return result;
  }

  /** 收集所有启用的 plugin 的资源 */
  async getAssets(config: Config): Promise<PluginAssets> {
    const cssParts: string[] = [];
    const jsParts: string[] = [];

    for (const plugin of this.plugins) {
      if (this.isEnabled(plugin.name, config) && plugin.getAssets) {
        const assets = await plugin.getAssets(config);
        if (assets.css) cssParts.push(assets.css);
        if (assets.js) jsParts.push(assets.js);
      }
    }

    return { css: cssParts.join("\n"), js: jsParts.join("\n") };
  }

  /** 验证所有 plugin 的配置 */
  validateConfig(config: Config): string[] {
    const errors: string[] = [];
    for (const plugin of this.plugins) {
      if (this.isEnabled(plugin.name, config) && plugin.validateConfig) {
        errors.push(...plugin.validateConfig(config));
      }
    }
    return errors;
  }
}
```

---

## 6. 各 Plugin 详细设计

### 6.1 highlight Plugin

```
plugins/highlight/
├── index.ts                    # 导出 plugin 定义
├── themes/                     # 主题 CSS（从 npm highlight.js 复制）
│   ├── atom-one-dark.css
│   ├── atom-one-light.css
│   ├── github-dark.css
│   └── github.css
└── runtime/
    └── theme-switcher.ts       # 主题切换 JS
```

**功能**：
- 根据 `code_highlight` 开关决定是否启用
- 读取主题 CSS 注入到 `{LIB_CSS}`
- 提供主题切换运行时 JS

**默认参数**：
```typescript
defaultConfig: {
  code_highlight: true,
  code_highlight_theme: "atom-one-dark",
  code_highlight_theme_light: "atom-one-light",
}
```

### 6.2 copy Plugin

```
plugins/copy/
├── index.ts
└── copy-button.ts
```

**功能**：
- 根据 `code_copy` 开关决定是否启用
- 注入复制按钮 JS 到 `{LIB_JS}`

**默认参数**：
```typescript
defaultConfig: {
  code_copy: true,
}
```

### 6.3 image-embed Plugin

```
plugins/image-embed/
├── index.ts                    # embedImagesInHtml 逻辑
├── fetch-image.ts              # 远端图片获取
└── process-image.ts            # sharp 图像处理（resize/compress）
```

**功能**：
- 根据 `img_to_base64` 开关决定是否启用
- 处理 HTML 中的 `<img>` 标签
- 支持本地图片和远端 URL
- 支持 `img_max_width` 和 `img_compress` 参数

**默认参数**：
```typescript
defaultConfig: {
  img_to_base64: false,
}
```

---

## 7. 迁移步骤

### 步骤 1：创建 plugins/ 目录结构

```
mkdir -p plugins/highlight/themes
mkdir -p plugins/highlight/runtime
mkdir -p plugins/copy
mkdir -p plugins/image-embed
```

### 步骤 2：删除 lib/highlight/（npm 管理）

```
rm -rf lib/highlight/
```

### 步骤 3：迁移 lib/copy/ 到 plugins/copy/

- 移动 `lib/copy/copy.js` → `plugins/copy/copy-button.ts`
- 改写为 TypeScript

### 步骤 4：创建 plugins/image-embed/

- 从 `src/adapters/node/fs.ts` 提取以下函数：
  - `embedImagesInHtml()`
  - `fetchRemoteImage()`
  - `processImageBuffer()`
- 改写为 plugin 格式

### 步骤 5：创建 plugins/highlight/

- 创建 `themes/` 目录，存放主题 CSS（可从 npm highlight.js 复制）
- 创建 `runtime/theme-switcher.ts`

### 步骤 6：创建 src/plugin-manager.ts

- 实现 PluginManager 类
- 实现 plugin 加载、配置合并、HTML 处理、资源收集逻辑

### 步骤 7：修改 src/cli/main.ts

- 导入 PluginManager
- 替换原有的 lib 加载逻辑
- 使用 pluginManager.processHtml() 和 getAssets()

### 步骤 8：删除旧 lib/ 目录

```
rm -rf lib/
```

### 步骤 9：更新文档

- 更新 `docs/[en]/` 和 `docs/[zh-TW]/` 中的说明
- 说明 plugin 架构
- 说明如何添加新 plugin

---

## 8. 扩展性

### 添加新 Plugin 示例

假设要添加 `math` plugin（数学公式支持）：

1. 创建 `plugins/math/index.ts`：
```typescript
export const mathPlugin = {
  name: "math",
  enabledByDefault: false,
  defaultConfig: {
    math_support: false,
  },
  processHtml: (html, config) => { /* 处理 latex */ },
  getAssets: (config) => ({ js: "/* math.js */" }),
};
```

2. 在 `plugin-manager.ts` 中导入并注册：
```typescript
import { mathPlugin } from "./plugins/math/index.js";

const builtInPlugins = [highlightPlugin, copyPlugin, imageEmbedPlugin, mathPlugin];
```

3. 用户可通过 `--math-support true` 启用

---

## 9. 注意事项

| 项目 | 说明 |
|------|------|
| **plugin 顺序** | image-embed 必须在 highlight 之前执行（因为会修改 img 标签） |
| **向后兼容** | 现有 config.toml 字段保持不变 |
| **静态资源** | plugin 的 CSS/JS 在 build 时注入，不增加运行时依赖 |
| **错误处理** | plugin 出错应仅跳过该 plugin，不应崩溃整个构建 |

---

## 10. 未来规划

- [ ] 支持用户自定义 plugin（放在项目根目录 `mdsone-plugins/`）
- [ ] plugin 市场文档
- [ ] 支持 plugin 之间的依赖声明

---

*规划完成，等待执行*
