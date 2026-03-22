# MCP 整合指南

本文件說明如何把 `mdsone` 以 MCP 方式接入常見代理工具，讓代理可以直接呼叫：

- `describe_capabilities`
- `list_templates`
- `convert_single`
- `convert_merge`
- `convert_i18n`

## 1. 先做全域安裝（建議）

```bash
npm install -g mdsone
mdsone --version
mdsone mcp --help
```

> 注意：全域安裝請用 `npm install -g mdsone`。  
> `npx` 適合一次性執行，不是全域安裝指令。

---

## 2. 通用 MCP 啟動方式（stdio）

`mdsone` 的 MCP 入口是：

- command: `mdsone`
- args: `["mcp"]`

等價寫法（不建議作為主方案）：

- command: `mdsone`
- args: `["mcp", "serve"]`

---

## 3. 各代理工具設定

## 3.1 Codex CLI / Codex App

```bash
codex mcp add mdsone -- mdsone mcp
codex mcp list
```

測試提示詞：

```text
先呼叫 describe_capabilities，摘要 mdsone 可做的事情。
```

```text
請用 list_templates 列出所有模板與 variants。
```

```text
請用 convert_single，把 ./README.md 轉成 ./.tmp/mcp-single.html，force=true，return_mode=path。
```

## 3.2 Claude Desktop

設定檔（Windows）：

- `%APPDATA%/Claude/claude_desktop_config.json`

加入：

```json
{
  "mcpServers": {
    "mdsone": {
      "command": "mdsone",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

完成後重啟 Claude Desktop。

## 3.3 Cursor

可放在：

- 專案層：`.cursor/mcp.json`
- 全域層：`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "mdsone": {
      "type": "stdio",
      "command": "mdsone",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

## 3.4 VS Code + GitHub Copilot（Agent）

建議放在專案：

- `.vscode/mcp.json`

```json
{
  "servers": {
    "mdsone": {
      "type": "stdio",
      "command": "mdsone",
      "args": ["mcp"]
    }
  }
}
```

設定後在 VS Code 的 Agent 模式啟用工具。

## 3.5 Cline（VS Code Extension）

在 Cline 的 MCP 設定檔加入：

```json
{
  "mcpServers": {
    "mdsone": {
      "command": "mdsone",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

---

## 4. 快速驗證流程

1. 呼叫 `describe_capabilities`，確認代理已識別 mdsone 的能力。
2. 呼叫 `list_templates`，確認模板列表可讀。
3. 呼叫 `convert_single` 產生一個 HTML，確認輸出路徑與大小。

---

## 5. 常見問題

## 5.1 `mdsone` 指令不存在

- 重新開啟終端機
- 執行 `npm config get prefix` 檢查全域安裝路徑
- 確認該路徑已在系統 `PATH`

## 5.2 工具看不到 / 沒有出現在代理工具列表

- 重新啟動代理工具
- 檢查 JSON 是否有多餘逗號或錯誤欄位
- 先用 `mdsone mcp --help` 確認命令可執行

## 5.3 轉檔失敗

- 先確認輸入檔路徑是否存在
- 用 `force=true` 避免舊輸出檔衝突
- 查看工具回傳的 `logs` 欄位

---

## 6. 官方參考

- MCP 規範與介紹：https://modelcontextprotocol.org/docs/getting-started/intro
- Claude Code / Claude Desktop MCP：https://docs.anthropic.com/en/docs/claude-code/mcp
- Cursor MCP：https://docs.cursor.com/en/context/model-context-protocol
- GitHub Copilot MCP：https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp
- Cline MCP 設定：https://docs.cline.bot/mcp/configuring-mcp-servers

