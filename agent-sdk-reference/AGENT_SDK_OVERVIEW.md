# Agent SDK Overview

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [What the Agent SDK Is](#1-what-the-agent-sdk-is)
2. [Installation and Authentication](#2-installation-and-authentication)
3. [The Agent Loop](#3-the-agent-loop)
4. [Message Types](#4-message-types)
5. [Models](#5-models)
6. [Effort Levels](#6-effort-levels)
7. [Turns and Budget Controls](#7-turns-and-budget-controls)
8. [Result Handling](#8-result-handling)
9. [Migration from Claude Code SDK](#9-migration-from-claude-code-sdk)
10. [Options Quick Reference](#10-options-quick-reference)

---

## 1. What the Agent SDK Is

The Claude Agent SDK gives you Claude Code's autonomous agent loop as a library. Your code sends a prompt; the SDK handles tool execution, context management, and multi-turn reasoning automatically.

### Three Levels of Claude Integration

| Layer | What You Get | You Implement |
|:------|:-------------|:--------------|
| **Messages API** | Raw HTTP API — send messages, get responses | Tool execution loop, context management, error handling, retries |
| **Client SDK** | Typed wrappers around the Messages API (`@anthropic-ai/sdk`) | Tool execution loop, context management |
| **Agent SDK** | Full agent loop with built-in tools, permissions, sessions, subagents | Your domain logic — prompts, custom tools, permissions |

The Agent SDK is the highest-level abstraction. It wraps the Client SDK internally and adds:

- **Built-in tools**: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion, Agent, Skill, TodoWrite, NotebookEdit, ToolSearch
- **Autonomous tool execution**: Claude decides which tools to call; the SDK executes them and feeds results back
- **Session persistence**: Conversations resume across calls with full context
- **Subagent orchestration**: Spawn specialized child agents with isolated context
- **Permission system**: Fine-grained control over what the agent can do
- **Hook lifecycle**: Intercept tool calls before/after execution
- **Cost tracking**: Per-query and per-session token usage and USD cost

### TypeScript

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const stream = query({
  prompt: "Find and fix the bug in auth.ts",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "acceptEdits",
  },
});

for await (const message of stream) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") console.log(block.text);
    }
  }
  if (message.type === "result") {
    console.log(`Cost: $${message.total_cost_usd}`);
  }
}
```

### Python

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Bash"],
            permission_mode="acceptEdits",
        ),
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text"):
                    print(block.text)
        elif isinstance(message, ResultMessage):
            print(f"Cost: ${message.total_cost_usd}")

asyncio.run(main())
```

---

## 2. Installation and Authentication

### Install

**TypeScript:**
```bash
npm install @anthropic-ai/claude-agent-sdk
```

**Python (pip or uv):**
```bash
pip install claude-agent-sdk
# or
uv add claude-agent-sdk
```

**Requirements:** Node.js 18+ (TypeScript) or Python 3.10+ (Python).

### Authentication

Set your API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=your-api-key
```

The SDK also supports third-party providers:

| Provider | Environment Variable | Credentials |
|:---------|:--------------------|:------------|
| **Amazon Bedrock** | `CLAUDE_CODE_USE_BEDROCK=1` | AWS credentials (IAM role, access key, or profile) |
| **Google Vertex AI** | `CLAUDE_CODE_USE_VERTEX=1` | Google Cloud credentials (service account or ADC) |
| **Microsoft Azure** | `CLAUDE_CODE_USE_FOUNDRY=1` | Azure credentials |

> Anthropic does not allow third-party developers to offer claude.ai login or rate limits for their products. Use API key authentication.

### Credential Proxy Pattern (Production)

For deployed agents, avoid exposing API keys directly. Use the credential proxy pattern:

```bash
# Point the SDK at your proxy, which injects the real API key
export ANTHROPIC_BASE_URL=https://your-proxy.internal/v1
# or
export HTTP_PROXY=https://your-proxy.internal
```

This lets you rotate keys, enforce per-tenant rate limits, and audit usage centrally.

---

## 3. The Agent Loop

Every SDK interaction follows a five-step cycle:

```
1. RECEIVE PROMPT
   ↓
2. EVALUATE & RESPOND  ←──┐
   Claude produces text    │
   and/or tool calls       │
   ↓                       │
3. EXECUTE TOOLS           │
   SDK runs each tool,     │
   collects results        │
   ↓                       │
4. REPEAT (one "turn")  ───┘
   Feed results back to
   Claude for next decision
   ↓
5. RETURN RESULT
   Claude responds with no
   tool calls → loop ends
```

### What Triggers Loop Termination

The loop ends when any of these conditions is met:

| Condition | Result Subtype |
|:----------|:---------------|
| Claude responds with text only (no tool calls) | `success` |
| `maxTurns` limit reached | `error_max_turns` |
| `maxBudgetUsd` limit reached | `error_max_budget_usd` |
| Unrecoverable error during execution | `error_during_execution` |
| Structured output validation fails repeatedly | `error_max_structured_output_retries` |

### Parallel Tool Execution

Read-only tools (Read, Glob, Grep, WebSearch) can run concurrently within a single turn. Tools that modify state (Edit, Write, Bash) run sequentially to avoid conflicts.

### Context Window Management

Everything accumulates in the context window: system prompt, tool definitions, conversation history, tool inputs, and tool outputs. The SDK automatically:

1. **Prompt-caches** content that stays the same across turns (system prompt, tool definitions)
2. **Compacts** older conversation history when the context window approaches its limit, summarizing it to free space

Compaction emits a `SystemMessage` with subtype `compact_boundary`. You can customize compaction behavior via:
- Summarization instructions in CLAUDE.md
- `PreCompact` hook (intercept before compaction)
- Manual `/compact` command

### Keep Context Efficient

- Use **subagents** for subtasks (each starts with fresh context)
- Be **selective with tools** — each tool definition consumes context
- Use **lower effort** for routine tasks
- Use **Tool Search** when you have 50+ tools (loads definitions on-demand)

---

## 4. Message Types

The SDK streams a sequence of typed messages. Every query ends with a `ResultMessage`.

| Type | Subtype | When Emitted | Key Fields |
|:-----|:--------|:-------------|:-----------|
| `SystemMessage` | `init` | First message of every query | `tools`, `mcp_servers`, `slash_commands`, `session_id` |
| `SystemMessage` | `compact_boundary` | After context compaction | — |
| `AssistantMessage` | — | After each Claude response | `message.content[]` (text blocks, tool_use blocks) |
| `UserMessage` | — | After tool execution | `message.content[]` (tool_result blocks) |
| `StreamEvent` | — | Only with `includePartialMessages: true` | Raw API streaming events (content deltas) |
| `ResultMessage` | `success` / `error_*` | Always last | `result`, `total_cost_usd`, `usage`, `modelUsage`, `session_id` |

### Reading Messages (TypeScript)

```typescript
for await (const msg of stream) {
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        console.log("Session:", msg.session_id);
        console.log("Tools:", msg.tools);
      }
      break;
    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") console.log(block.text);
        if (block.type === "tool_use") console.log(`Calling: ${block.name}`);
      }
      break;
    case "result":
      console.log(`Done (${msg.subtype}): $${msg.total_cost_usd}`);
      break;
  }
}
```

---

## 5. Models

### Current Model Lineup

| Model | API ID | Input | Output | Context | Max Output | Best For |
|:------|:-------|:------|:-------|:--------|:-----------|:---------|
| **Claude Opus 4.6** | `claude-opus-4-6` | $5/MTok | $25/MTok | 1M tokens | 128k tokens | Complex reasoning, multi-step agents, coding |
| **Claude Sonnet 4.6** | `claude-sonnet-4-6` | $3/MTok | $15/MTok | 1M tokens | 64k tokens | Balanced speed/intelligence, general agents |
| **Claude Haiku 4.5** | `claude-haiku-4-5-20251001` | $1/MTok | $5/MTok | 200k tokens | 64k tokens | Fast tasks, classification, simple lookups |

### Model Selection for Agents

| Use Case | Recommended Model | Why |
|:---------|:-----------------|:----|
| Complex multi-step workflows | Opus 4.6 | Deepest reasoning, best tool-use accuracy |
| General-purpose agents | Sonnet 4.6 | Good balance of cost and capability |
| High-volume simple tasks | Haiku 4.5 | 5x cheaper than Opus, fast |
| Subagents doing lookups | Haiku 4.5 | Minimizes cost on subordinate tasks |
| Tool Search | Sonnet 4.6 or Opus 4.6 | Haiku does not support Tool Search |

### Setting the Model

```typescript
// TypeScript
const stream = query({
  prompt: "...",
  options: { model: "claude-sonnet-4-6" },
});

// Change model mid-session
await stream.setModel("claude-opus-4-6");
```

```python
# Python
async for msg in query(
    prompt="...",
    options=ClaudeAgentOptions(model="claude-sonnet-4-6"),
):
    ...
```

### Subagent Model Selection

Subagents use model aliases (`"sonnet"`, `"opus"`, `"haiku"`, `"inherit"`) rather than full model IDs:

```typescript
const agents = {
  "code-reviewer": {
    description: "Reviews code for bugs",
    prompt: "Review the code for bugs and security issues.",
    tools: ["Read", "Glob", "Grep"],
    model: "sonnet",  // Uses current Sonnet version
  },
};
```

---

## 6. Effort Levels

Controls how much reasoning Claude applies before responding. Lower effort = faster and cheaper.

| Level | Behavior | Good For | Approximate Cost Impact |
|:------|:---------|:---------|:-----------------------|
| `"low"` | Minimal reasoning | File lookups, listing directories, simple queries | Lowest |
| `"medium"` | Balanced | Routine edits, standard tasks | Moderate |
| `"high"` | Thorough analysis (default) | Refactors, debugging, code review | Standard |
| `"max"` | Maximum reasoning depth | Multi-step problems, deep analysis, architecture | Highest |

```typescript
const stream = query({
  prompt: "List the files in src/",
  options: { effort: "low" },
});
```

---

## 7. Turns and Budget Controls

### maxTurns

Caps the number of tool-use round trips. A "turn" is one cycle: Claude produces tool calls → SDK executes → results feed back.

```typescript
const stream = query({
  prompt: "Fix the failing tests",
  options: { maxTurns: 10 },  // Stop after 10 tool-use turns
});
```

If the limit is reached, the result subtype is `error_max_turns`.

### maxBudgetUsd

Caps total spend for a single query.

```typescript
const stream = query({
  prompt: "Refactor the auth module",
  options: { maxBudgetUsd: 2.00 },  // Stop if cost exceeds $2
});
```

If the budget is exceeded, the result subtype is `error_max_budget_usd`.

### Combining Controls

```typescript
const stream = query({
  prompt: "...",
  options: {
    maxTurns: 20,
    maxBudgetUsd: 5.00,
    // Whichever limit is hit first stops the loop
  },
});
```

---

## 8. Result Handling

Every query ends with a `ResultMessage`. Check `subtype` to determine what happened.

| Subtype | Meaning | `result` Field? | Action |
|:--------|:--------|:----------------|:-------|
| `success` | Claude finished normally | Yes — final text response | Use result |
| `error_max_turns` | Hit `maxTurns` limit | No | Increase limit or adjust prompt |
| `error_max_budget_usd` | Hit `maxBudgetUsd` limit | No | Increase budget or use cheaper model |
| `error_during_execution` | Unrecoverable error | No | Check `errors[]` for details |
| `error_max_structured_output_retries` | Structured output schema validation failed | No | Fix schema or adjust prompt |

### TypeScript Result Handling

```typescript
for await (const msg of stream) {
  if (msg.type === "result") {
    if (msg.subtype === "success") {
      console.log("Result:", msg.result);
      console.log("Cost:", msg.total_cost_usd);
      console.log("Session:", msg.session_id);

      // Per-model token breakdown
      for (const [model, usage] of Object.entries(msg.modelUsage ?? {})) {
        console.log(`${model}: ${usage.input_tokens}in / ${usage.output_tokens}out`);
      }
    } else {
      console.error(`Failed: ${msg.subtype}`, msg.errors);
    }
  }
}
```

### Python Result Handling

```python
async for msg in query(prompt="...", options=options):
    if isinstance(msg, ResultMessage):
        if msg.subtype == "success":
            print(f"Result: {msg.result}")
            print(f"Cost: ${msg.total_cost_usd}")
        else:
            print(f"Failed: {msg.subtype}")
```

### ResultMessage Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `subtype` | string | Result category (see table above) |
| `result` | string | Final text response (success only) |
| `total_cost_usd` | number | Total cost of this query |
| `usage` | object | Aggregate token counts (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) |
| `modelUsage` | object | Per-model token breakdown |
| `session_id` | string | Session ID for resumption |
| `structured_output` | unknown | Parsed structured output (if `outputFormat` was set) |

---

## 9. Migration from Claude Code SDK

The SDK was renamed from "Claude Code SDK" to "Claude Agent SDK" in v0.1.0 to reflect its broader capabilities beyond coding tasks.

### Package Changes

| Aspect | Old | New |
|:-------|:----|:----|
| TypeScript package | `@anthropic-ai/claude-code` | `@anthropic-ai/claude-agent-sdk` |
| Python package | `claude-code-sdk` | `claude-agent-sdk` |
| Python options type | `ClaudeCodeOptions` | `ClaudeAgentOptions` |

### Breaking Changes in v0.1.0

**1. System prompt no longer loaded by default**

The SDK now uses a minimal system prompt. To get Claude Code's full system prompt:

```typescript
// Explicitly request the Claude Code preset
const stream = query({
  prompt: "...",
  options: {
    systemPrompt: { type: "preset", preset: "claude_code" },
  },
});
```

**2. Settings sources no longer loaded by default**

The SDK no longer reads CLAUDE.md, settings.json, slash commands, or skills from the filesystem. To re-enable:

```typescript
const stream = query({
  prompt: "...",
  options: {
    settingSources: ["user", "project", "local"],
  },
});
```

This change ensures predictable behavior in CI/CD, deployed applications, testing, and multi-tenant systems.

### Migration Steps

**TypeScript:**
```bash
npm uninstall @anthropic-ai/claude-code
npm install @anthropic-ai/claude-agent-sdk
```
Then update all imports from `@anthropic-ai/claude-code` to `@anthropic-ai/claude-agent-sdk`.

**Python:**
```bash
pip uninstall claude-code-sdk
pip install claude-agent-sdk
```
Then update imports from `claude_code_sdk` to `claude_agent_sdk` and rename `ClaudeCodeOptions` to `ClaudeAgentOptions`.

---

## 10. Options Quick Reference

Complete configuration reference for `query()`. TypeScript property names shown; Python equivalents use `snake_case`.

| Property | Type | Default | Description |
|:---------|:-----|:--------|:------------|
| `allowedTools` | `string[]` | `[]` | Tools to auto-approve without prompting |
| `disallowedTools` | `string[]` | `[]` | Tools to always deny |
| `agents` | `Record<string, AgentDefinition>` | `undefined` | Programmatic subagent definitions |
| `canUseTool` | `CanUseTool` | `undefined` | Custom permission callback |
| `cwd` | `string` | `process.cwd()` | Working directory for the agent |
| `effort` | `"low" \| "medium" \| "high" \| "max"` | `"high"` | Reasoning effort level |
| `enableFileCheckpointing` | `boolean` | `false` | Track file changes for rewind |
| `env` | `Record<string, string>` | `process.env` | Environment variables |
| `hooks` | `Record<HookEvent, HookCallbackMatcher[]>` | `{}` | Lifecycle hook callbacks |
| `includePartialMessages` | `boolean` | `false` | Stream partial message events |
| `maxBudgetUsd` | `number` | `undefined` | Maximum spend per query |
| `maxTurns` | `number` | `undefined` | Maximum tool-use turns |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | External MCP server configs |
| `model` | `string` | CLI default | Model ID (e.g., `"claude-sonnet-4-6"`) |
| `outputFormat` | `{ type: "json_schema", schema }` | `undefined` | Structured output schema |
| `permissionMode` | `PermissionMode` | `"default"` | Permission behavior mode |
| `plugins` | `SdkPluginConfig[]` | `[]` | Plugin paths to load |
| `resume` | `string` | `undefined` | Session ID to resume |
| `settingSources` | `SettingSource[]` | `[]` | Which filesystem settings to load |
| `systemPrompt` | `string \| { type: "preset", preset: "claude_code", append? }` | `undefined` | System prompt or preset |
| `tools` | `string[] \| { type: "preset", preset: "claude_code" }` | `undefined` | Tool configuration |

---

## Pricing and Cost Implications for Agentic Loops

Agent loops consume tokens on every turn. A typical agent interaction involves:

| Component | Token Impact |
|:----------|:------------|
| System prompt + tool definitions | ~346 tokens overhead per request (tool use system prompt) |
| Each tool call round-trip | Input tokens (prompt + history) + output tokens (reasoning + tool call) |
| Tool results | Fed back as input tokens on the next turn |
| Context growth | Each turn adds to the conversation, increasing input tokens |

### Cost Optimization Strategies

1. **Model selection by task**: Use Haiku ($1/$5) for simple subagent tasks, Sonnet ($3/$15) for general agents, Opus ($5/$25) only for complex reasoning
2. **Prompt caching**: The SDK automatically caches system prompts and tool definitions. Cache reads cost 10% of standard input price
3. **Budget controls**: Always set `maxBudgetUsd` in production to prevent runaway costs
4. **Effort levels**: Use `"low"` or `"medium"` for routine tasks to reduce output tokens
5. **Subagents**: Isolate subtasks to prevent context window bloat in the parent agent
6. **Batch API**: 50% discount for non-real-time workloads (not applicable to Agent SDK directly, but relevant for preprocessing)

### Example Cost Estimate

A customer support agent handling 10,000 tickets with Opus 4.6:
- ~3,700 tokens per conversation average
- **~$37 total** (~$0.0037 per ticket)

---

## See Also

- [Tools Reference](./AGENT_SDK_TOOLS.md) — Built-in tools, custom tools, MCP, permissions
- [Sessions](./AGENT_SDK_SESSIONS.md) — Session management, checkpointing, compaction
- [Streaming](./AGENT_SDK_STREAMING.md) — Real-time output streaming, streaming input
- [Skills and Prompts](./AGENT_SDK_SKILLS_AND_PROMPTS.md) — System prompts, skills, slash commands
- [Subagents](./AGENT_SDK_SUBAGENTS.md) — Subagent architecture and patterns
- [Deployment](./AGENT_SDK_DEPLOYMENT.md) — Hosting, security, hooks, cost tracking
- [Patterns](./AGENT_SDK_PATTERNS.md) — chat-engine-x-specific implementation patterns
