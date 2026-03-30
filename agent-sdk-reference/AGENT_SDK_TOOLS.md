# Agent SDK Tools Reference

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [Built-in Tools Reference](#1-built-in-tools-reference)
2. [Custom Tools via In-Process MCP](#2-custom-tools-via-in-process-mcp)
3. [External MCP Servers](#3-external-mcp-servers)
4. [Tool Search](#4-tool-search)
5. [Permission System](#5-permission-system)
6. [canUseTool Callback](#6-canusetool-callback)
7. [Structured Outputs](#7-structured-outputs)
8. [Tool Annotations and Error Handling](#8-tool-annotations-and-error-handling)
9. [Decision Tree: Which Tool Approach](#9-decision-tree-which-tool-approach)

---

## 1. Built-in Tools Reference

The Agent SDK includes tools that run automatically — no implementation required.

| Tool | Category | What It Does | Key Input Fields |
|:-----|:---------|:-------------|:-----------------|
| **Read** | File ops | Read any file in the working directory | `file_path`, `offset?`, `limit?`, `pages?` |
| **Write** | File ops | Create new files | `file_path`, `content` |
| **Edit** | File ops | Make precise edits to existing files | `file_path`, `old_string`, `new_string`, `replace_all?` |
| **Bash** | Execution | Run shell commands, scripts, git operations | `command`, `timeout?`, `description?`, `run_in_background?` |
| **Glob** | Search | Find files by pattern (`**/*.ts`, `src/**/*.py`) | `pattern`, `path?` |
| **Grep** | Search | Search file contents with regex | `pattern`, `path?`, `glob?`, `output_mode?`, `multiline?` |
| **WebSearch** | Web | Search the web for current information | `query`, `allowed_domains?`, `blocked_domains?` |
| **WebFetch** | Web | Fetch and parse web page content | `url`, `prompt` |
| **ToolSearch** | Discovery | Dynamically find and load deferred tools | `query`, `max_results?` |
| **Agent** | Orchestration | Spawn subagents for subtasks | `description`, `prompt`, `subagent_type?`, `model?`, `resume?` |
| **Skill** | Orchestration | Invoke a loaded skill | `skill`, `args?` |
| **AskUserQuestion** | Orchestration | Ask the user clarifying questions | `questions[]` with `question`, `options`, `multiSelect?` |
| **TodoWrite** | Orchestration | Track task progress | `todos[]` with `content`, `status`, `activeForm` |
| **NotebookEdit** | File ops | Edit Jupyter notebook cells | `notebook_path`, `new_source`, `cell_type?`, `edit_mode?` |

### Parallel Execution

Read-only tools (Read, Glob, Grep, WebSearch) run concurrently within a turn. Tools that modify state (Edit, Write, Bash) run sequentially.

---

## 2. Custom Tools via In-Process MCP

Custom tools are functions you define that run in the same process as your application. They're implemented as in-process MCP servers — no subprocess management needed.

### TypeScript: `tool()` + `createSdkMcpServer()`

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define a tool with Zod schema
const weatherTool = tool(
  "get_weather",
  "Get the current weather for a city",
  {
    city: z.string().describe("City name"),
    units: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
  },
  async (args) => {
    const response = await fetch(`https://api.weather.example.com/${args.city}`);
    const data = await response.json();
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ temp: data.temp, condition: data.condition }),
      }],
    };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

// Bundle into an MCP server
const mcpServer = createSdkMcpServer({
  name: "my-tools",
  tools: [weatherTool],
});

// Use in query
const stream = query({
  prompt: "What's the weather in London?",
  options: {
    mcpServers: { "my-tools": mcpServer },
    allowedTools: ["mcp__my-tools__get_weather"],
  },
});
```

### Python: `@tool` decorator

```python
from claude_agent_sdk import query, tool, create_sdk_mcp_server, ClaudeAgentOptions

@tool(name="get_weather", description="Get current weather for a city")
async def get_weather(city: str, units: str = "celsius") -> dict:
    # Tool implementation
    response = await fetch_weather(city)
    return {"content": [{"type": "text", "text": json.dumps(response)}]}

mcp_server = create_sdk_mcp_server(name="my-tools", tools=[get_weather])

async for msg in query(
    prompt="What's the weather in London?",
    options=ClaudeAgentOptions(
        mcp_servers={"my-tools": mcp_server},
        allowed_tools=["mcp__my-tools__get_weather"],
    ),
):
    ...
```

### Handler Return Type: `CallToolResult`

Tool handlers return a `CallToolResult` with content blocks:

| Block Type | Use Case | Example |
|:-----------|:---------|:--------|
| `{ type: "text", text: "..." }` | Most common — text results | JSON data, status messages |
| `{ type: "image", data: "...", mimeType: "image/png" }` | Image results | Charts, screenshots |
| `{ type: "resource", resource: { uri, text, mimeType } }` | Structured resources | File contents, API responses |

Add `isError: true` to signal a failed tool call (see Section 8).

### Tool Annotations

```typescript
const myTool = tool("name", "desc", schema, handler, {
  annotations: {
    title: "Human-readable title",      // Optional display name
    readOnlyHint: true,                  // Default: false — tool doesn't modify state
    destructiveHint: false,              // Default: true — tool may be destructive
    idempotentHint: true,                // Default: false — safe to retry
    openWorldHint: true,                 // Default: true — interacts with external systems
  },
});
```

Annotations affect permission evaluation and parallel execution decisions.

---

## 3. External MCP Servers

Connect to external MCP servers for third-party integrations (GitHub, Slack, databases, etc.).

### Transport Types

| Transport | Config Type | When to Use |
|:----------|:-----------|:------------|
| **stdio** | `McpStdioServerConfig` | Local processes (CLIs, scripts) |
| **HTTP** | `McpHttpServerConfig` | Remote HTTP servers (recommended) |
| **SSE** | `McpSSEServerConfig` | Server-Sent Events transport |
| **SDK** | `McpSdkServerConfigWithInstance` | In-process (see Section 2) |

### TypeScript Configuration

```typescript
const stream = query({
  prompt: "List open GitHub issues",
  options: {
    mcpServers: {
      // stdio transport — runs a local process
      github: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN! },
      },
      // HTTP transport — connects to a remote server
      database: {
        type: "http",
        url: "https://mcp.example.com/postgres",
        headers: { Authorization: `Bearer ${process.env.DB_TOKEN}` },
      },
    },
    allowedTools: ["mcp__github__*", "mcp__database__*"],
  },
});
```

### Tool Naming Convention

MCP tools are named: `mcp__<server-name>__<tool-name>`

The `<server-name>` comes from the key in `mcpServers`. For example, a server keyed as `"github"` with a tool called `create_issue` becomes `mcp__github__create_issue`.

Use this pattern in `allowedTools` with wildcards: `"mcp__github__*"` allows all tools from the GitHub server.

### Authentication

| Transport | Auth Method |
|:----------|:-----------|
| stdio | Environment variables passed via `env` field |
| HTTP/SSE | `headers` field (e.g., `Authorization: Bearer ...`) |
| OAuth2 | Configured via server-specific setup |

### Error Handling

MCP server connection failures don't crash the agent. Check server status:

```typescript
const status = await stream.mcpServerStatus();
for (const server of status) {
  console.log(`${server.name}: ${server.status}`); // "connected" | "error"
}
```

---

## 4. Tool Search

When you have 50+ tools, loading all definitions into the context window wastes tokens. Tool Search lets Claude discover tools on-demand.

### How It Works

1. You register tools with `defer_loading: true` (or use the `ENABLE_TOOL_SEARCH` env var)
2. The SDK exposes only tool names and descriptions at startup
3. When Claude needs a tool, it calls the built-in `ToolSearch` tool
4. The SDK loads 3-5 matching tool definitions into context
5. Claude uses the now-loaded tool normally

### Configuration

```typescript
// Enable via environment variable
process.env.ENABLE_TOOL_SEARCH = "true";   // Always enabled
process.env.ENABLE_TOOL_SEARCH = "auto";   // Enabled when tool count exceeds default threshold
process.env.ENABLE_TOOL_SEARCH = "auto:5"; // Enabled when tool count exceeds 5
process.env.ENABLE_TOOL_SEARCH = "false";  // Disabled (all tools loaded upfront)
```

### Requirements and Limits

- **Model**: Requires Claude Sonnet 4+ or Opus 4+ (Haiku does NOT support Tool Search)
- **Limit**: 10,000 tools maximum
- **Results**: 3-5 tools loaded per search
- **Token savings**: Up to 85% reduction in tool definition tokens

### Optimize for Tool Search

Write clear, specific tool names and descriptions — Claude searches by these:

```typescript
// Good: specific, descriptive
tool("search_github_issues", "Search for open or closed issues in a GitHub repository by label, author, or text query", ...)

// Bad: vague
tool("search", "Search for things", ...)
```

---

## 5. Permission System

Permissions control which tools the agent can run and when it needs approval.

### Evaluation Order

When Claude requests a tool call, the SDK evaluates permissions in this order:

```
1. Hooks (PreToolUse) → Can deny or allow with highest priority
2. disallowedTools → Always denied, no override
3. permissionMode → Mode-specific behavior
4. allowedTools → Auto-approved if listed
5. canUseTool → Custom callback for everything else
```

If a hook returns `deny`, the tool is blocked regardless of other rules. If `disallowedTools` matches, the tool is blocked. Then the permission mode determines what happens to tools not explicitly allowed or denied.

### allowedTools / disallowedTools

```typescript
const stream = query({
  prompt: "...",
  options: {
    allowedTools: ["Read", "Glob", "Grep", "mcp__my-tools__*"],
    disallowedTools: ["Bash", "Write"],
  },
});
```

Wildcard patterns are supported: `"mcp__github__*"` matches all GitHub MCP tools.

### Permission Modes

| Mode | Behavior | When to Use |
|:-----|:---------|:------------|
| `"default"` | Tools not in allow/deny rules trigger `canUseTool` callback | Custom approval flows |
| `"acceptEdits"` | Auto-approves file edits (Write, Edit), others follow default | Trusted dev workflows |
| `"dontAsk"` (TS only) | Denies anything not in `allowedTools` — never prompts | Locked-down production agents |
| `"bypassPermissions"` | All tools run without asking | Sandboxed CI/CD, fully trusted |
| `"plan"` | No tool execution — Claude produces a plan | Review before action |

**Production recommendation**: `"dontAsk"` with an explicit `allowedTools` list.

### Subagent Permission Inheritance

Subagents inherit the parent's `allowedTools` but can be further restricted via `AgentDefinition.tools`. They do NOT inherit `bypassPermissions` — each subagent respects its own permission scope.

---

## 6. canUseTool Callback

For custom approval logic beyond allow/deny lists, implement a `canUseTool` callback.

### TypeScript Signature

```typescript
const canUseTool = async (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    toolUseID: string;
    agentID?: string;
  }
): Promise<PermissionResult> => {
  // Return allow or deny
};
```

### PermissionResult

```typescript
// Allow (optionally modify input or update permissions)
{ behavior: "allow", updatedInput?: Record<string, unknown>, updatedPermissions?: PermissionUpdate[] }

// Deny (with reason message)
{ behavior: "deny", message: string, interrupt?: boolean }
```

### Example: Auto-Approve Read-Only, Gate Writes

```typescript
const canUseTool = async (toolName: string, input: Record<string, unknown>) => {
  const readOnlyTools = ["Read", "Glob", "Grep", "WebSearch"];
  if (readOnlyTools.includes(toolName)) {
    return { behavior: "allow" as const };
  }

  // Block access to sensitive paths
  const filePath = (input as any).file_path ?? "";
  if (filePath.includes(".env") || filePath.includes("credentials")) {
    return { behavior: "deny" as const, message: "Access to sensitive files denied" };
  }

  return { behavior: "allow" as const };
};
```

### Handling AskUserQuestion

When Claude calls AskUserQuestion, you can intercept it via `canUseTool` to programmatically answer:

```typescript
const canUseTool = async (toolName: string, input: Record<string, unknown>) => {
  if (toolName === "AskUserQuestion") {
    const questions = (input as any).questions as Array<{ question: string; options: string[] }>;
    // Auto-answer based on your logic
    return {
      behavior: "allow" as const,
      updatedInput: {
        ...input,
        // Provide answers programmatically
      },
    };
  }
  return { behavior: "allow" as const };
};
```

---

## 7. Structured Outputs

Force the agent's final response to conform to a JSON schema.

### TypeScript with Zod

```typescript
import { z } from "zod";

const codeReviewSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(["critical", "warning", "info"]),
    file: z.string(),
    line: z.number(),
    description: z.string(),
    suggestion: z.string(),
  })),
  summary: z.string(),
  score: z.number().min(0).max(10),
});

const stream = query({
  prompt: "Review src/auth.ts for security issues",
  options: {
    outputFormat: {
      type: "json_schema",
      schema: zodToJsonSchema(codeReviewSchema), // Convert Zod to JSON Schema
    },
    allowedTools: ["Read", "Glob", "Grep"],
  },
});

for await (const msg of stream) {
  if (msg.type === "result" && msg.subtype === "success") {
    const review = codeReviewSchema.parse(msg.structured_output);
    console.log(`Score: ${review.score}/10`);
    console.log(`Issues: ${review.issues.length}`);
  }
}
```

### Python with Pydantic

```python
from pydantic import BaseModel

class CodeIssue(BaseModel):
    severity: str
    file: str
    line: int
    description: str

class CodeReview(BaseModel):
    issues: list[CodeIssue]
    summary: str
    score: float

# Use CodeReview.model_json_schema() for the outputFormat schema
```

### Error Handling

If the agent fails to produce valid structured output after retries, the result subtype is `error_max_structured_output_retries`.

### Limitations

- Structured output is returned complete in `ResultMessage.structured_output` — NOT streamed
- The schema must be valid JSON Schema
- Complex nested schemas may require more turns for the agent to fill correctly

---

## 8. Tool Annotations and Error Handling

### How Annotations Affect Behavior

| Annotation | Default | Effect |
|:-----------|:--------|:-------|
| `readOnlyHint: true` | `false` | Enables parallel execution, lower permission barrier |
| `destructiveHint: false` | `true` | Reduces permission scrutiny |
| `idempotentHint: true` | `false` | Safe to retry on failure |
| `openWorldHint: true` | `true` | Indicates external interaction (network, APIs) |

### isError: Graceful Tool Failure

Return `isError: true` to tell Claude the tool call failed — Claude will see the error message and can adjust its approach:

```typescript
async (args) => {
  try {
    const result = await apiCall(args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `API call failed: ${err.message}. Try different parameters.` }],
      isError: true,
    };
  }
}
```

### isError vs Exceptions

| Approach | When | Behavior |
|:---------|:-----|:---------|
| `isError: true` | Recoverable failure | Claude sees the error, can retry or try a different approach |
| Throw exception | Unrecoverable failure | Ends the agent loop with `error_during_execution` |

**Prefer `isError: true`** for API errors, rate limits, and bad input. Only throw exceptions for truly fatal conditions (misconfiguration, auth failure).

---

## 9. Decision Tree: Which Tool Approach

```
Do you need file ops, search, web access, or shell execution?
  → YES: Use built-in tools (Read, Edit, Bash, Glob, Grep, WebSearch, WebFetch)

Do you need to call your own APIs or run domain logic?
  → YES: Use custom tools via in-process MCP (tool() + createSdkMcpServer())

Do you need to connect to third-party services (GitHub, Slack, databases)?
  → YES: Use external MCP servers (stdio/HTTP/SSE transport)

Do you have 50+ tools?
  → YES: Enable Tool Search (ENABLE_TOOL_SEARCH=auto)

Do you need the agent to produce structured data?
  → YES: Use outputFormat with JSON Schema
```

### Combining Approaches

Most production agents combine multiple tool sources:

```typescript
const stream = query({
  prompt: "...",
  options: {
    // Built-in tools
    allowedTools: ["Read", "Glob", "Grep", "mcp__my-tools__*", "mcp__github__*"],
    // Custom in-process tools
    mcpServers: {
      "my-tools": createSdkMcpServer({ name: "my-tools", tools: [searchTool, enrichTool] }),
      // External MCP server
      github: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    },
  },
});
```

---

## See Also

- [Overview](./AGENT_SDK_OVERVIEW.md) — SDK fundamentals, models, pricing
- [Sessions](./AGENT_SDK_SESSIONS.md) — Session management, checkpointing
- [Streaming](./AGENT_SDK_STREAMING.md) — Real-time output streaming
- [Skills and Prompts](./AGENT_SDK_SKILLS_AND_PROMPTS.md) — System prompts, skills, plugins
- [Subagents](./AGENT_SDK_SUBAGENTS.md) — Subagent architecture
- [Deployment](./AGENT_SDK_DEPLOYMENT.md) — Hosting, security, hooks, cost tracking
- [Patterns](./AGENT_SDK_PATTERNS.md) — chat-engine-x-specific patterns
