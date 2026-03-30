# Agent SDK Patterns for chat-engine-x

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation + chat-engine-x codebase (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript)

**This file is TypeScript only.** It maps Agent SDK concepts to the actual chat-engine-x architecture.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Platform Routing as AgentDefinition Factory](#2-platform-routing-as-agentdefinition-factory)
3. [Provider Rules as Tool Input Injection](#3-provider-rules-as-tool-input-injection)
4. [M2M Auth Pattern](#4-m2m-auth-pattern)
5. [Session Persistence](#5-session-persistence)
6. [Streaming Integration](#6-streaming-integration)
7. [Subagent Workflow: Multi-Engine Orchestration](#7-subagent-workflow-multi-engine-orchestration)
8. [Permission Model for Multi-Tenant](#8-permission-model-for-multi-tenant)
9. [Cost Control Patterns](#9-cost-control-patterns)
10. [Error Handling](#10-error-handling)
11. [Hook Patterns for chat-engine-x](#11-hook-patterns-for-chat-engine-x)
12. [Testing Agents Locally](#12-testing-agents-locally)
13. [Migration Path: AI SDK to Agent SDK](#13-migration-path-ai-sdk-to-agent-sdk)

---

## 1. Architecture Overview

chat-engine-x-api is a Hono/TypeScript backend that centralizes AI chat orchestration across multiple platforms (OutboundHQ, PaidEdge, PaidAutopsy). It currently uses the **Vercel AI SDK** (`@ai-sdk/anthropic` + `ai` with `streamText()`) for LLM interaction. The Agent SDK is the target architecture for richer agentic capabilities.

### Current Stack

```
chat-package (React) → chat-engine-x-api (Hono) → Anthropic Claude (AI SDK)
                                ↓
                    ┌───────────┼───────────┐
                    │           │           │
              data-engine-x  creative-  outbound-
                             engine-x   engine-x
```

### How chat-engine-x Maps to Agent SDK Concepts

| chat-engine-x Concept | Agent SDK Equivalent |
|:-----------------------|:---------------------|
| Platform flow (.md file) | `AgentDefinition` or `systemPrompt` configuration |
| Capability module (tools.ts + prompt.md) | Custom tools via `tool()` + `createSdkMcpServer()` |
| Provider rules (Supabase) | Tool input injection via `canUseTool` or hooks |
| `streamText().toUIMessageStreamResponse()` | `query()` with `includePartialMessages: true` → SSE transform |
| Platform header (`X-Platform`) | Selects which `AgentDefinition` to construct |
| Auth context (AuthContext) | Injected into custom tool handlers and hooks |
| Downstream service calls (M2M tokens) | Custom tool handlers with `config.services.*` credentials |

### Two-Dimensional Configuration

chat-engine-x resolves behavior from two independent dimensions:

1. **Platform → Chat Flow**: Which capabilities are active, what the system prompt says
2. **Org × Client → Provider Rules**: Where data comes from when the agent calls downstream services

Both dimensions are resolved before the Agent SDK `query()` call.

---

## 2. Platform Routing as AgentDefinition Factory

Each platform in chat-engine-x has a flow definition (`.md` file with YAML frontmatter). In the Agent SDK world, these become factories that produce `AgentDefinition` objects.

### Current: Flow Loader

```typescript
// src/flows/loader.ts — existing pattern
interface FlowConfig {
  platform: string;
  capabilities: string[];
  systemPrompt: string;
}
```

Example flow file (`src/flows/outboundhq.md`):
```markdown
---
platform: outboundhq
capabilities:
  - list-building
  - campaign-orchestration
---
You are an outbound sales assistant for OutboundHQ...
```

### Agent SDK Pattern: AgentDefinition Factory

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { getFlowConfig, type FlowConfig } from "./flows/loader.js";
import { getCapabilityTools } from "./capabilities/index.js";
import { resolveProviderRules, toProviderFilters } from "./provider-rules/resolver.js";
import type { AuthContext } from "./middleware/auth.js";

/**
 * Build Agent SDK options dynamically from platform + org/client context.
 * This is the core pattern: platform determines WHAT the agent can do,
 * org/client context determines HOW it accesses external data.
 */
function buildAgentOptions(
  flow: FlowConfig,
  auth: AuthContext,
  providerFilters: Record<string, unknown>
) {
  // Collect tools from all active capability modules
  const capabilityTools = getCapabilityTools(flow.capabilities, auth, providerFilters);

  // Create an in-process MCP server with the capability tools
  const mcpServer = createSdkMcpServer({
    name: `chat-engine-x-${flow.platform}`,
    tools: capabilityTools,
  });

  return {
    systemPrompt: flow.systemPrompt,
    mcpServers: { capabilities: mcpServer },
    allowedTools: [
      // Built-in tools for code/file analysis (if needed)
      "Read", "Glob", "Grep",
      // All capability tools are auto-approved via MCP
      ...capabilityTools.map((t) => `mcp__capabilities__${t.name}`),
    ],
    permissionMode: "dontAsk" as const,
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 2.00,
    maxTurns: 20,
  };
}

/**
 * Handle a chat request — the main entry point.
 */
async function handleChatRequest(
  platform: string,
  auth: AuthContext,
  userMessage: string
) {
  // Dimension 1: Platform → Flow config
  const flow = getFlowConfig(platform);
  if (!flow) throw new Error(`Unknown platform: ${platform}`);

  // Dimension 2: Org × Client → Provider rules
  const rules = await resolveProviderRules(auth.orgId, auth.clientId, "all");
  const providerFilters = toProviderFilters(rules);

  // Build and run the agent
  const options = buildAgentOptions(flow, auth, providerFilters);

  const stream = query({
    prompt: userMessage,
    options,
  });

  return stream;
}
```

### Why Not Subagents Per Platform?

You could define each platform as a separate subagent, but the simpler pattern is a single agent with dynamically composed tools and system prompt. Use subagents when:

- A single chat interaction needs to cross platform boundaries (rare)
- You need parallel research across multiple data sources
- You need context isolation for different reasoning modes (e.g., "research mode" vs "execution mode")

---

## 3. Provider Rules as Tool Input Injection

Provider rules determine which external data providers to use (Prospeo, BlitzAPI, LeadMagic, Enigma, etc.). These rules are resolved per org/client and injected into tool handlers.

### Three-Tier Resolution

```typescript
// src/provider-rules/resolver.ts — existing pattern
// 1. Org + client specific (client_id = clientId)
// 2. Org default (client_id IS NULL)
// 3. Empty array (downstream service uses its own defaults)
```

### Agent SDK Pattern: Inject via Custom Tool Handlers

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { config } from "./config.js";

/**
 * Create a list-building tool that injects provider preferences.
 * The agent never sees or controls which providers are used —
 * that's determined by the org's provider rules.
 */
function createSearchEntitiesTools(
  auth: AuthContext,
  providerFilters: Record<string, unknown>
) {
  return tool(
    "search_entities",
    "Search for companies or people matching criteria. Results come from the org's configured data providers.",
    {
      entityType: z.enum(["companies", "people"]),
      query: z.string().describe("Search query or criteria"),
      limit: z.number().optional().default(25),
    },
    async (args) => {
      // Provider filters are closed over — not visible to the agent
      const response = await fetch(`${config.services.dataEngineX.url}/v1/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.services.dataEngineX.token}`,
          "X-Org-Id": auth.orgId,
          ...(auth.clientId ? { "X-Client-Id": auth.clientId } : {}),
        },
        body: JSON.stringify({
          entity_type: args.entityType,
          query: args.query,
          limit: args.limit,
          provider_filters: providerFilters,
        }),
      });

      if (!response.ok) {
        return { content: [{ type: "text", text: `Search failed: ${response.statusText}` }], isError: true };
      }

      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
    { annotations: { readOnlyHint: true, openWorldHint: true } }
  );
}
```

### Alternative: Inject via PreToolUse Hook

If you want to inject provider filters without modifying tool definitions:

```typescript
const hooks = {
  PreToolUse: [{
    matcher: "^mcp__capabilities__",
    hooks: [async (input, toolUseId, { signal }) => {
      // Inject provider_filters into every capability tool call
      const toolInput = input.tool_input as Record<string, unknown>;
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: {
            ...toolInput,
            provider_filters: providerFilters,
            org_id: auth.orgId,
            client_id: auth.clientId,
          },
        },
      };
    }],
  }],
};
```

---

## 4. M2M Auth Pattern

chat-engine-x authenticates to downstream engine-x services using M2M (machine-to-machine) tokens stored in Doppler and loaded via `config.services.*`.

### Current Config

```typescript
// src/config.ts — existing pattern
services: {
  dataEngineX:    { url: "...", token: "..." },
  creativeEngineX: { url: "...", token: "..." },
  outboundEngineX: { url: "...", token: "..." },
  paidEngineX:    { url: "...", token: "..." },
}
```

### Agent SDK Pattern: Credentials in Custom Tool Handlers

The agent never sees service tokens. They're injected in tool handlers via closure:

```typescript
function createServiceClient(serviceConfig: { url: string; token: string }) {
  return async (path: string, body: unknown, auth: AuthContext) => {
    const response = await fetch(`${serviceConfig.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceConfig.token}`,
        "X-Org-Id": auth.orgId,
        ...(auth.clientId ? { "X-Client-Id": auth.clientId } : {}),
      },
      body: JSON.stringify(body),
    });
    return response;
  };
}

// Usage in tool handler:
const dexClient = createServiceClient(config.services.dataEngineX);
const cexClient = createServiceClient(config.services.creativeEngineX);
```

### Auth Flow Diagram

```
User JWT (EdDSA from auth-engine-x)
  → chat-engine-x auth middleware validates via JWKS
  → AuthContext: { userId, orgId, role, tokenType, clientId }
  → Custom tool handlers use config.services.*.token for M2M calls
  → Org/client context passed as headers, NOT as auth tokens
```

### For the Proxy Pattern (Production Hardening)

In production, consider moving M2M tokens behind a credential proxy:

```typescript
// Instead of direct service tokens in config:
const PROXY_URL = process.env.SERVICE_PROXY_URL; // Internal proxy that injects tokens

async function callService(service: string, path: string, body: unknown) {
  return fetch(`${PROXY_URL}/${service}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Proxy resolves service → actual URL + token
}
```

---

## 5. Session Persistence

chat-engine-x needs to map Agent SDK sessions to chat thread IDs managed by the frontend (assistant-ui).

### Current: assistant-ui Thread Persistence

The frontend uses assistant-ui Cloud for thread CRUD. chat-engine-x receives the full message history on every request — it's stateless.

### Agent SDK Pattern: Session Resume for Multi-Turn

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Thread ID from assistant-ui → Agent SDK session ID mapping
const sessionStore = new Map<string, string>(); // threadId → agentSessionId

async function handleChatRequest(
  threadId: string,
  userMessage: string,
  options: ReturnType<typeof buildAgentOptions>
) {
  const existingSessionId = sessionStore.get(threadId);

  const stream = query({
    prompt: userMessage,
    options: {
      ...options,
      ...(existingSessionId ? { resume: existingSessionId } : {}),
    },
  });

  for await (const msg of stream) {
    if (msg.type === "result") {
      // Persist the session mapping
      sessionStore.set(threadId, msg.session_id);
    }
    // ... transform and stream to client
  }
}
```

### Supabase-Backed Session Store (Production)

```typescript
async function getSessionId(threadId: string): Promise<string | null> {
  const { data } = await db
    .from("chat_sessions")
    .select("agent_session_id")
    .eq("thread_id", threadId)
    .single();
  return data?.agent_session_id ?? null;
}

async function saveSessionId(threadId: string, agentSessionId: string): Promise<void> {
  await db
    .from("chat_sessions")
    .upsert({
      thread_id: threadId,
      agent_session_id: agentSessionId,
      updated_at: new Date().toISOString(),
    });
}
```

### Stateless Alternative

If session persistence is too complex, chat-engine-x can remain stateless by sending the full message history on each request (current approach). The Agent SDK supports this — just don't pass `resume`.

> **Gap:** The Agent SDK stores sessions on disk in the working directory. For containerized deployments on Railway, session data is ephemeral unless you mount persistent storage or use the session resume pattern with an external store.

---

## 6. Streaming Integration

chat-engine-x must bridge Agent SDK streaming to the assistant-ui UIMessage stream protocol that the frontend expects.

### Current: AI SDK Streaming

```typescript
// Current pattern — AI SDK
const result = streamText({
  model: anthropic("claude-sonnet-4-6"),
  system: composedSystemPrompt,
  messages: await convertToModelMessages(messages),
  tools: { ...capabilityTools },
});
return result.toUIMessageStreamResponse();
```

### Agent SDK Pattern: Transform to SSE

The Agent SDK streams `SDKMessage` objects. These need to be transformed into the UIMessage SSE protocol:

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { stream } from "hono/streaming";

const app = new Hono();

app.post("/v1/chat", authMiddleware, async (c) => {
  const { messages, platform, threadId } = await parseRequest(c);
  const auth = c.get("auth");

  const agentStream = query({
    prompt: messages[messages.length - 1].content,
    options: buildAgentOptions(platform, auth),
  });

  // Stream Agent SDK output as SSE
  return stream(c, async (sseStream) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    for await (const msg of agentStream) {
      const sseEvents = transformToUIMessageEvents(msg);
      for (const event of sseEvents) {
        await sseStream.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }

    await sseStream.write("data: [DONE]\n\n");
  });
});

/**
 * Transform Agent SDK messages to UIMessage stream events.
 */
function transformToUIMessageEvents(msg: SDKMessage): unknown[] {
  const events: unknown[] = [];

  switch (msg.type) {
    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          events.push({ type: "text-delta", textDelta: block.text });
        }
        if (block.type === "tool_use") {
          events.push({
            type: "tool-input-available",
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
          });
        }
      }
      break;

    case "user":
      // Tool results — map to tool-output-available
      for (const block of msg.message.content) {
        if (block.type === "tool_result") {
          events.push({
            type: "tool-output-available",
            toolCallId: block.tool_use_id,
            output: block.content,
          });
        }
      }
      break;

    case "result":
      events.push({ type: "finish", finishReason: msg.subtype === "success" ? "stop" : "error" });
      break;
  }

  return events;
}
```

### With Partial Messages (Real-Time Streaming)

For true real-time streaming (character by character), enable `includePartialMessages`:

```typescript
const agentStream = query({
  prompt: userMessage,
  options: {
    ...agentOptions,
    includePartialMessages: true,
  },
});

for await (const msg of agentStream) {
  if (msg.type === "stream_event") {
    // Forward raw deltas for real-time display
    const delta = extractDelta(msg);
    if (delta) {
      sseStream.write(`data: ${JSON.stringify(delta)}\n\n`);
    }
  }
}
```

> **Gap:** The exact mapping between Agent SDK `StreamEvent` types and assistant-ui UIMessage protocol events is not fully documented. You'll need to handle: `content_block_start`, `content_block_delta` (text_delta and input_json_delta), `content_block_stop`, `message_start`, `message_delta`, `message_stop`.

---

## 7. Subagent Workflow: Multi-Engine Orchestration

When a user's request spans multiple engine-x services, use subagents to parallelize and isolate context.

### Example: "Build me a prospect list and draft an outreach campaign"

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

const agents = {
  "data-researcher": {
    description: "Searches for and enriches company/people data. Use when the user needs to find prospects, build lists, or look up company information.",
    prompt: `You are a data research specialist. Use the search and enrichment tools to find prospects matching the user's criteria. Return structured results.`,
    tools: ["mcp__capabilities__search_entities", "mcp__capabilities__enrich_companies", "mcp__capabilities__create_list"],
    model: "sonnet" as const,
    maxTurns: 10,
  },
  "campaign-builder": {
    description: "Creates and manages outbound campaigns. Use after prospect data is available and the user wants to launch outreach.",
    prompt: `You are a campaign orchestration specialist. Help the user create multi-channel outreach campaigns with appropriate sequences and timing.`,
    tools: ["mcp__capabilities__create_campaign", "mcp__capabilities__add_leads_to_campaign"],
    model: "sonnet" as const,
    maxTurns: 10,
  },
};

const stream = query({
  prompt: "Find 50 SaaS companies with 50-200 employees in Austin, TX, then create an email campaign targeting their CTOs",
  options: {
    agents,
    allowedTools: ["Agent"],  // Main agent only orchestrates
    systemPrompt: "You are a sales automation coordinator. Break the user's request into steps and delegate to the appropriate specialist agents.",
    model: "claude-opus-4-6",  // Orchestrator uses Opus for planning
    maxBudgetUsd: 5.00,
  },
});
```

### When to Use Single Agent vs Subagents

| Scenario | Pattern | Why |
|:---------|:--------|:----|
| Single capability (e.g., list building only) | Single agent with capability tools | Simpler, less overhead |
| Cross-capability (research + campaign) | Subagents per capability | Context isolation, parallel execution |
| Complex reasoning + execution | Orchestrator + worker subagents | Opus plans, Sonnet executes |
| Multi-org batch processing | Parallel subagents per org | Prevent data leakage between orgs |

---

## 8. Permission Model for Multi-Tenant

In a multi-tenant system, the agent must never access data from other orgs. The permission model enforces this.

### Pattern: org-Scoped Tool Restrictions

```typescript
function buildPermissions(auth: AuthContext) {
  return {
    permissionMode: "dontAsk" as const,
    allowedTools: [
      // Only capability tools for this platform — no file system access
      "mcp__capabilities__search_entities",
      "mcp__capabilities__enrich_companies",
      "mcp__capabilities__create_list",
      // No Bash, Edit, Write — this is a production chat agent, not a coding agent
    ],
    canUseTool: async (toolName: string, input: Record<string, unknown>) => {
      // Additional validation: ensure org_id in tool input matches auth context
      if (input.org_id && input.org_id !== auth.orgId) {
        return { behavior: "deny" as const, message: "Cross-org access denied" };
      }
      return { behavior: "allow" as const };
    },
  };
}
```

### Principle: No File System Tools in Production Chat

Unlike coding agents, chat-engine-x agents should NOT have access to Read, Write, Edit, Bash, Glob, or Grep in production. The agent interacts with downstream services exclusively through custom tools (MCP servers).

```typescript
// Production: only custom capability tools
allowedTools: ["mcp__capabilities__*"]

// Development/testing: add file tools for debugging
allowedTools: ["mcp__capabilities__*", "Read", "Glob", "Grep"]
```

---

## 9. Cost Control Patterns

### Per-Request Budget

Always set `maxBudgetUsd` to prevent runaway costs:

```typescript
const DEFAULT_BUDGETS: Record<string, number> = {
  outboundhq: 2.00,    // List building can be multi-step
  paidedge: 1.00,      // Ad diagnostics are usually quick
  paidautopsy: 1.50,   // Analysis may require research
};

function getBudget(platform: string): number {
  return DEFAULT_BUDGETS[platform] ?? 1.00;
}
```

### Model Selection by Task Complexity

```typescript
function selectModel(flow: FlowConfig, messageCount: number): string {
  // Use cheaper model for simple follow-ups
  if (messageCount > 5) return "claude-haiku-4-5-20251001";

  // Use Sonnet for most interactions
  if (flow.capabilities.length <= 2) return "claude-sonnet-4-6";

  // Use Opus for complex multi-capability flows
  return "claude-opus-4-6";
}
```

### Per-Org Cost Tracking

```typescript
async function trackCost(auth: AuthContext, costUsd: number): Promise<void> {
  await db.from("usage_tracking").insert({
    org_id: auth.orgId,
    client_id: auth.clientId,
    cost_usd: costUsd,
    timestamp: new Date().toISOString(),
  });
}

// In the request handler:
for await (const msg of stream) {
  if (msg.type === "result") {
    await trackCost(auth, msg.total_cost_usd);
  }
}
```

### Effort Level Optimization

```typescript
// Quick lookups: low effort
const lookupOptions = { effort: "low" as const, model: "claude-haiku-4-5-20251001" };

// Standard chat: medium effort
const chatOptions = { effort: "medium" as const, model: "claude-sonnet-4-6" };

// Complex analysis: high effort
const analysisOptions = { effort: "high" as const, model: "claude-opus-4-6" };
```

---

## 10. Error Handling

### Custom Tool Errors: Use isError

```typescript
const searchTool = tool(
  "search_entities",
  "Search for companies or people",
  { query: z.string() },
  async (args) => {
    try {
      const response = await dexClient("/v1/search", args, auth);

      if (!response.ok) {
        // Graceful failure: agent sees the error and can retry or adjust
        return {
          content: [{ type: "text", text: `Search failed (${response.status}): ${response.statusText}. Try adjusting your criteria.` }],
          isError: true,
        };
      }

      return { content: [{ type: "text", text: JSON.stringify(await response.json()) }] };
    } catch (err) {
      // Network errors
      return {
        content: [{ type: "text", text: `Service unavailable: ${err instanceof Error ? err.message : "Unknown error"}` }],
        isError: true,
      };
    }
  }
);
```

### Result Subtype Handling

```typescript
for await (const msg of stream) {
  if (msg.type === "result") {
    switch (msg.subtype) {
      case "success":
        return { status: "ok", response: msg.result, cost: msg.total_cost_usd };

      case "error_max_turns":
        return { status: "incomplete", message: "Agent reached step limit. Please try a more specific request." };

      case "error_max_budget_usd":
        return { status: "budget_exceeded", message: "Request exceeded cost limit." };

      case "error_during_execution":
        logger.error("Agent execution error", { errors: msg.errors, orgId: auth.orgId });
        return { status: "error", message: "An internal error occurred." };
    }
  }
}
```

---

## 11. Hook Patterns for chat-engine-x

### Audit Logging

```typescript
const auditHook = async (input: any, toolUseId: string | undefined) => {
  logger.info("tool_call", {
    event: input.hook_event_name,
    tool: input.tool_name,
    session: input.session_id,
    orgId: auth.orgId,
    toolUseId,
  });
  return {};
};

const hooks = {
  PreToolUse: [{ hooks: [auditHook] }],
  PostToolUse: [{ hooks: [auditHook] }],
};
```

### Cost Threshold Stop Hook

```typescript
let accumulatedCost = 0;
const COST_WARN_THRESHOLD = 1.50;

const costWatcherHook = async (input: any) => {
  // Check running cost from the latest assistant message usage
  if (accumulatedCost > COST_WARN_THRESHOLD) {
    return {
      systemMessage: `Warning: This conversation has used $${accumulatedCost.toFixed(2)}. Be more concise.`,
    };
  }
  return {};
};
```

### Provider-Rule-Aware PreToolUse

```typescript
const providerRuleHook = async (input: any) => {
  if (input.tool_name.startsWith("mcp__capabilities__")) {
    const toolInput = input.tool_input as Record<string, unknown>;

    // Always inject org context and provider filters
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: {
          ...toolInput,
          _org_id: auth.orgId,
          _client_id: auth.clientId,
          _provider_filters: providerFilters,
        },
      },
    };
  }
  return {};
};
```

---

## 12. Testing Agents Locally

### Development Setup

```bash
# Set required env vars (or use Doppler)
export ANTHROPIC_API_KEY=sk-ant-...
export SUPABASE_URL=http://localhost:54321
export SUPABASE_SERVICE_ROLE_KEY=...
export AUTH_JWKS_URL=http://localhost:3001/api/auth/jwks
export AUTH_ISSUER=http://localhost:3001
export AUTH_AUDIENCE=http://localhost:3001

# Run the dev server
npm run dev
```

### Unit Testing Custom Tools

```typescript
import { describe, it, expect } from "vitest";
import { createSearchEntitiesTools } from "./capabilities/list-building/tools.js";

describe("search_entities tool", () => {
  it("should return results for valid query", async () => {
    const mockAuth = { userId: "u1", orgId: "org1", role: "admin", tokenType: "session" as const, clientId: null };
    const mockFilters = { get_companies: { providers: [{ name: "blitzapi", config: null }] } };

    const searchTool = createSearchEntitiesTools(mockAuth, mockFilters);

    // Test the tool handler directly
    const result = await searchTool.handler(
      { entityType: "companies", query: "SaaS Austin TX", limit: 10 },
      {}
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("text");
  });
});
```

### Integration Testing with Agent SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

it("should complete a simple search flow", async () => {
  const stream = query({
    prompt: "Find 5 tech companies in San Francisco",
    options: {
      ...buildAgentOptions(getFlowConfig("outboundhq")!, mockAuth, {}),
      maxTurns: 5,
      maxBudgetUsd: 0.50,
    },
  });

  let result;
  for await (const msg of stream) {
    if (msg.type === "result") result = msg;
  }

  expect(result?.subtype).toBe("success");
  expect(result?.total_cost_usd).toBeLessThan(0.50);
});
```

---

## 13. Migration Path: AI SDK to Agent SDK

The codebase currently uses the Vercel AI SDK (`streamText()` from `ai`). Here's what changes and what stays when migrating to the Agent SDK.

### What Changes

| Component | AI SDK (Current) | Agent SDK (Target) |
|:----------|:-----------------|:-------------------|
| LLM call | `streamText({ model: anthropic(...), ... })` | `query({ prompt, options })` |
| Tool definitions | `tool({ parameters: zodSchema(z.object({...})) })` | `tool(name, desc, zodSchema, handler)` |
| Tool execution | AI SDK executes tools automatically | Agent SDK executes tools automatically |
| Streaming | `.toUIMessageStreamResponse()` | Custom transform (see Section 6) |
| System prompt | Passed to `streamText({ system: ... })` | `systemPrompt` option on `query()` |
| Model selection | `anthropic("claude-sonnet-4-6")` | `model: "claude-sonnet-4-6"` |

### What Stays the Same

- **Hono framework** — routing, middleware, CORS, error handling
- **Auth middleware** — EdDSA JWT validation, AuthContext
- **Flow loader** — platform flow .md files with YAML frontmatter
- **Provider rules** — Supabase queries, three-tier resolution
- **Config** — Doppler secrets, service URLs/tokens
- **Deployment** — Railway, Docker

### Migration Steps

1. `npm install @anthropic-ai/claude-agent-sdk`
2. Convert tool definitions from AI SDK format to Agent SDK `tool()` format
3. Bundle tools into `createSdkMcpServer()`
4. Replace `streamText()` calls with `query()` calls
5. Build SSE transform layer (Section 6) to maintain frontend compatibility
6. Add `maxBudgetUsd` and `maxTurns` to all production agent calls
7. Add audit hooks for observability
8. Test with `permissionMode: "dontAsk"` to ensure all needed tools are in `allowedTools`

### Why Migrate?

| Capability | AI SDK | Agent SDK |
|:-----------|:-------|:----------|
| Autonomous multi-step reasoning | Limited (stepCountIs) | Full agent loop |
| Subagents | Not supported | Built-in |
| Session persistence | Not built-in | Built-in |
| File checkpointing | Not built-in | Built-in |
| Permission system | Not built-in | Built-in |
| Hooks for audit/control | Not built-in | 17+ hook events |
| Cost tracking | Manual | Built-in (total_cost_usd) |

---

## See Also

- [Overview](./AGENT_SDK_OVERVIEW.md) — SDK fundamentals, models, pricing
- [Tools Reference](./AGENT_SDK_TOOLS.md) — Built-in tools, custom tools, MCP, permissions
- [Sessions](./AGENT_SDK_SESSIONS.md) — Session management, checkpointing, compaction
- [Streaming](./AGENT_SDK_STREAMING.md) — Real-time output streaming
- [Skills and Prompts](./AGENT_SDK_SKILLS_AND_PROMPTS.md) — System prompts, skills, plugins
- [Subagents](./AGENT_SDK_SUBAGENTS.md) — Subagent architecture and patterns
- [Deployment](./AGENT_SDK_DEPLOYMENT.md) — Hosting, security, hooks, cost tracking
