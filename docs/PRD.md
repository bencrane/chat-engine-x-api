# chat-engine-x-api — Product Requirements Document

> Technical PRD for building chat-engine-x-api from scratch. This document is the single source of truth for a build agent implementing the service.

---

## 1. Overview & Purpose

**chat-engine-x-api** is a standalone backend service that centralizes AI chat orchestration across multiple platforms. It replaces per-platform `/api/chat` routes (currently embedded in frontend apps like OEX) with a single service that dynamically loads platform-specific flows and org/client-specific data provider configurations.

### Why This Service Exists

1. **Multiple platforms need AI chat.** PaidEdge, OutboundHQ, PaidAutopsy, and future products all need AI chat capabilities with tool-calling, streaming, and multi-step reasoning.
2. **Each platform has a different chat flow.** Campaign building, list building, ad diagnostics, creative generation — each platform activates a different combination of capabilities.
3. **Data providers vary by org and client context.** When the AI builds lists or enriches records, the specific providers used (Prospeo, BlitzAPI, LeadMagic, Enigma, etc.) depend on the org's configuration and optionally the client's overrides.
4. **Centralization enables compounding improvements.** A fix or enhancement to the orchestration layer benefits every platform simultaneously.
5. **The current approach doesn't scale.** Embedding `/api/chat` in each frontend app means duplicated LLM logic, no shared auth, no provider rule resolution, and no cross-platform tool reuse.

### What It Delivers

A single `POST /v1/chat` endpoint that:
- Accepts messages in the assistant-ui UIMessage format
- Resolves the platform context to load the right chat flow and tools
- Resolves the org/client context to load the right data provider preferences
- Calls Anthropic Claude via the AI SDK with a composed system prompt and tool set
- Executes backend tools server-side (calling downstream engine-x services)
- Streams SSE responses back to the frontend in the AI SDK UIMessage stream protocol

---

## 2. Architecture & Service Boundaries

### System Diagram

```
┌──────────────┐     ┌──────────────┐     ┌────────────────────┐     ┌──────────────┐
│              │     │              │     │                    │     │              │
│ chat-package │────>│   Runtime    │────>│ chat-engine-x-api  │────>│   Anthropic  │
│   (React)    │<────│  (React ctx) │<────│   (this service)   │<────│   (Claude)   │
│              │     │              │     │                    │     │              │
└──────────────┘     └──────────────┘     └────────┬───────────┘     └──────────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
                              │ Data      │ │ Creative  │ │ Outbound  │
                              │ Engine X  │ │ Engine X  │ │ Engine X  │
                              └───────────┘ └───────────┘ └───────────┘
                                                          ┌───────────┐
                              Optional:                   │ Paid      │
                           ┌──────────────┐               │ Engine X  │
                           │  Assistant   │               └───────────┘
                           │   Cloud      │
                           │ (thread      │
                           │  persistence)│
                           └──────────────┘
```

### Service Boundary Definitions

#### chat-package (existing, frontend)

- **What it is:** React UI shell that renders the chat interface. Uses `@assistant-ui/react` components (`<Thread />`, `<Composer />`, etc.).
- **What changes:** Will be updated to accept a configurable API endpoint via `AssistantChatTransport` instead of hardcoded `/api/chat`. Will point at `chat-engine-x-api`.
- **Not our scope:** We don't modify chat-package in this PRD. That's a separate integration task.

#### assistant-ui Cloud (existing, external)

- **What it is:** Hosted thread persistence layer. Thread CRUD, message history, title auto-generation.
- **What it does NOT do:** Does NOT make LLM calls, execute tools, hold system prompts, or route requests to backends.
- **Relationship:** Cloud and chat-engine-x-api are fully independent paths. The frontend talks to Cloud for thread persistence and to chat-engine-x-api for chat orchestration. They never call each other.
- **Not our scope:** Cloud auth migration from anonymous to per-user is future work.

#### chat-engine-x-api (new, this service)

- **Owns:** All AI orchestration. Receives messages from frontends via the assistant-ui protocol.
- **Resolves:** Platform context (which flow + capabilities to load) and org/client context (which provider rules to apply).
- **Calls:** Anthropic Claude via AI SDK `streamText()`. Downstream engine-x services (DEX, CEX, OEX, Paid Engine X) via HTTP.
- **Streams:** SSE responses back to the frontend using `toUIMessageStreamResponse()`.

#### Data Engine X (existing, downstream)

- **What it is:** External data provider orchestration — enrichment, search, entity resolution, list management.
- **How chat-engine-x uses it:** chat-engine-x resolves provider preferences from its `provider_rules` table, then passes them to DEX as `provider_filters` on each request. DEX stays a dumb executor — it does not know about tenants, platforms, or provider priorities.

#### Creative Engine X (existing, downstream)

- **What it is:** Creative asset generation — ads, landing pages, copy, voice.
- **How chat-engine-x uses it:** When the platform flow includes creative generation capabilities, chat-engine-x calls CEX with brand context from the org.

#### Outbound Engine X (existing, downstream)

- **What it is:** Campaign orchestration — email, LinkedIn, direct mail, voicemail, voice, SMS campaigns.
- **How chat-engine-x uses it:** When the platform flow includes campaign management capabilities, chat-engine-x calls OEX with campaign and lead data.

#### Paid Engine X (existing, downstream)

- **What it is:** Paid advertising campaign management.
- **How chat-engine-x uses it:** When the platform flow includes paid campaign capabilities, chat-engine-x calls Paid Engine X with ad account and campaign configuration.

---

## 3. Two-Dimensional Configuration Model

chat-engine-x resolves behavior from two independent config dimensions:

### Dimension 1: Platform → Chat Flow

The **platform** determines *what the AI can do* — which capabilities are enabled, what the system prompt says, what tools are available, and what the conversational flow looks like.

**How it works:**
- Platform flows are defined as `.md` files within chat-engine-x (e.g., `flows/paidedge.md`, `flows/outboundhq.md`, `flows/paidautopsy.md`).
- Each flow specifies which **capability modules** to load. A capability module is a group of related tools and system prompt sections (e.g., list-building capability, creative-generation capability, campaign-orchestration capability).
- The platform identifier is passed by the frontend on each request via a custom header (`X-Platform`).

**Example flow file (`flows/outboundhq.md`):**
```markdown
# OutboundHQ Chat Flow

## Capabilities
- list-building
- campaign-orchestration

## System Prompt
You are an outbound sales assistant. You help users build targeted prospect lists
and launch multi-channel outreach campaigns.

When the user asks to find companies or people, use the list-building tools.
When the user asks to create or manage campaigns, use the campaign tools.

Always confirm before executing actions that cost credits or send messages.
```

### Dimension 2: Org x Client → Provider Rules

The **org/client context** determines *where data comes from* when the AI needs to build lists, enrich records, or search for entities.

**How it works:**
- Provider rules are stored in a Supabase config table (`provider_rules`) keyed on `org_id`, `client_id` (nullable), `data_need`, `provider`, and `priority`.
- **Resolution order:** org x client specific rules → org-level defaults (where `client_id` is NULL) → global DEX defaults (env vars in DEX).
- Provider rules are looked up by chat-engine-x before calling DEX. The resolved provider preferences are passed to DEX via `provider_filters` on each request.
- Provider rules may be applied at multiple points during a single chat conversation (e.g., midway to preview results, later to enrich contacts, again to finalize a list).

**Resolution example:**
```
Request: org_id=abc, client_id=xyz, data_need="get_companies"

1. Check: provider_rules WHERE org_id=abc AND client_id=xyz AND data_need='get_companies'
   → Found: [{ provider: "enigma", priority: 1 }, { provider: "blitzapi", priority: 2 }]
   → Use these.

2. If not found, check: provider_rules WHERE org_id=abc AND client_id IS NULL AND data_need='get_companies'
   → Found: [{ provider: "blitzapi", priority: 1 }]
   → Use this as org-level default.

3. If not found: DEX uses its own global defaults (env vars).
```

### How the Two Dimensions Compose

At session start, chat-engine-x:
1. Reads the platform header → loads the flow `.md` file → determines which capability modules to activate
2. Reads the org/client headers → queries `provider_rules` → resolves provider preferences
3. Composes the system prompt = flow instructions + capability module prompt sections
4. Composes the tool set = capability module tools (with provider preferences injected into tool execute functions)
5. Calls `streamText()` with the composed system prompt, tools, and message history

---

## 4. Auth Chain

### Full Auth Flow

```
User ──auth──> Platform Frontend ──request──> chat-engine-x-api ──service-call──> Engine X services
                                                    │
                                                    ▼
                                              Supabase (provider_rules)
```

**Step 1: User authenticates to the platform.**
The user logs into a platform (e.g., PaidEdge) and gets a JWT or session token. This is platform-specific auth — chat-engine-x does not manage user registration or login.

**Step 2: Platform frontend sends chat messages to chat-engine-x.**
The request includes:
- `Authorization` header: Bearer token (the user's platform JWT or a platform-level service token)
- `X-Platform` header: Platform identifier (e.g., `paidedge`, `outboundhq`, `paidautopsy`)
- `X-Org-Id` header: The user's organization ID
- `X-Client-Id` header (optional): The specific client within the org

**Step 3: chat-engine-x validates auth and extracts context.**
- Validates the JWT signature (shared secret or public key per platform)
- Extracts `org_id` from the token claims (or trusts the header if using a verified service token)
- Uses `org_id` + optional `client_id` to resolve provider rules
- Uses `platform` to load the correct flow config

**Step 4: chat-engine-x authenticates to downstream services.**
- Service-to-service tokens (machine credentials managed via Doppler)
- The org/client context is passed as request parameters, not as auth tokens
- Each downstream service (DEX, CEX, OEX, Paid Engine X) has its own service token

**Step 5: assistant-ui Cloud (independent path).**
- The frontend sends thread persistence calls directly to Cloud
- Cloud auth is currently anonymous — known gap for future work
- Cloud and chat-engine-x are independent; they never call each other

### Token Types

| Token | Who Creates It | Who Validates It | Purpose |
|---|---|---|---|
| Platform JWT | Platform auth service | chat-engine-x | Identifies the user, org, and permissions |
| Service tokens | Doppler | Downstream engine-x services | Machine-to-machine auth for API calls |
| Cloud auth | assistant-ui Cloud | Cloud | Thread persistence (currently anonymous) |

---

## 5. Protocol Compatibility

chat-engine-x-api must be protocol-compatible with assistant-ui's frontend runtime. The primary protocol path is the **AI SDK UIMessage stream**.

### Request Contract

```
POST /v1/chat
Content-Type: application/json
Authorization: Bearer <platform-jwt>
X-Platform: paidedge
X-Org-Id: <uuid>
X-Client-Id: <uuid>  (optional)
```

**Body:**
```jsonc
{
  "messages": UIMessage[],          // Full conversation history
  "tools": {                         // Optional frontend tool schemas
    "toolName": {
      "description": "string",
      "parameters": { /* JSON Schema 7 */ }
    }
  },
  "system": "string | undefined",   // Optional system prompt override
  "trigger": "submit-message" | "regenerate-message",
  "id": "string"                     // Conversation ID
}
```

**Required fields:** `messages`, `trigger`, `id`

**UIMessage structure:**
```typescript
interface UIMessage {
  id: string;
  role: "system" | "user" | "assistant";
  metadata?: unknown;
  parts: UIMessagePart[];
}
```

Where `UIMessagePart` is a union of `text`, `reasoning`, `tool-invocation`, `source-url`, `source-document`, `file`, and `step-start` parts.

### Response Contract

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Vercel-AI-UI-Message-Stream: v1
X-Accel-Buffering: no
```

SSE stream with events:
- **Lifecycle:** `start`, `start-step`, `finish-step`, `finish`, `abort`
- **Text:** `text-start`, `text-delta`, `text-end`
- **Reasoning:** `reasoning-start`, `reasoning-delta`, `reasoning-end`
- **Tool input:** `tool-input-start`, `tool-input-delta`, `tool-input-available`, `tool-input-error`
- **Tool output:** `tool-output-available`, `tool-output-error`, `tool-output-denied`
- **Sources:** `source-url`, `source-document`
- **Error:** `error`

Stream terminates with `data: [DONE]\n\n`.

### Implementation

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";

const result = streamText({
  model: anthropic(process.env.CHAT_MODEL || "claude-sonnet-4-20250514"),
  system: composedSystemPrompt,
  messages: await convertToModelMessages(messages),
  stopWhen: stepCountIs(5),
  tools: {
    ...frontendTools(clientTools ?? {}),
    ...getToolsForPlatform(platformConfig, providerRules),
  },
});

return result.toUIMessageStreamResponse();
```

**Critical implementation notes:**
- `convertToModelMessages()` is **async** in AI SDK v6 — must `await`
- Tool schemas use `inputSchema: zodSchema(z.object({...}))`, NOT `parameters: z.object({...})`
- `frontendTools(undefined)` is safe — returns empty object
- The frontend sends `AssistantChatTransport({ api: "https://chat.example.com/v1/chat" })`

### CORS

Since chat-engine-x runs on a different origin than frontends:
- Handle preflight `OPTIONS` requests
- Return `Access-Control-Allow-Origin` matching the requesting frontend origin
- Return `Access-Control-Allow-Headers: Authorization, X-Platform, X-Org-Id, X-Client-Id, Content-Type`
- Return `Access-Control-Allow-Credentials: true` if cookies are forwarded

---

## 6. Capability Module System

Tools and system prompt sections are organized into **capability modules**. Each module encapsulates:

1. A set of tool definitions (using the AI SDK `tool()` pattern with Zod schemas)
2. System prompt instructions that tell the AI when and how to use those tools
3. The downstream service(s) the tools call

### Module Structure

```
src/capabilities/
  list-building/
    tools.ts          -- tool definitions (tool() + zodSchema())
    prompt.md         -- module-specific system prompt sections
    client.ts         -- HTTP client for Data Engine X calls
  creative-generation/
    tools.ts
    prompt.md
    client.ts         -- HTTP client for Creative Engine X calls
  campaign-orchestration/
    tools.ts
    prompt.md
    client.ts         -- HTTP client for Outbound Engine X calls
  paid-campaign/
    tools.ts
    prompt.md
    client.ts         -- HTTP client for Paid Engine X calls
  index.ts            -- aggregates modules, exports loader
```

### Initial Capability Modules

#### list-building
- **Tools:** `searchEntities`, `enrichCompanies`, `enrichPeople`, `createList`, `addToList`, `getList`, `exportList`, `getLookalikes`
- **Downstream:** Data Engine X
- **Provider rules apply here:** Provider preferences from `provider_rules` are injected into each DEX call as `provider_filters`
- **System prompt focus:** Guiding the AI to ask clarifying questions about search criteria, present results in tables, confirm before credit-consuming operations

#### creative-generation
- **Tools:** `generateAdCreative`, `generateLandingPage`, `generateCopyVariants`, `generateVoiceScript`
- **Downstream:** Creative Engine X
- **Brand context:** Loaded from org configuration and passed to CEX
- **System prompt focus:** Understanding brand guidelines, iterating on creative with user feedback

#### campaign-orchestration
- **Tools:** `createCampaign`, `addLeadsToCampaign`, `getCampaignStatus`, `pauseCampaign`, `getInboxReplies`, `getAnalytics`
- **Downstream:** Outbound Engine X
- **System prompt focus:** Channel selection guidance, sequence building, compliance checks

#### paid-campaign
- **Tools:** `createAdCampaign`, `setAdBudget`, `getAdPerformance`, `pauseAdCampaign`, `getAdAccountStatus`
- **Downstream:** Paid Engine X
- **System prompt focus:** Budget recommendations, audience targeting, performance benchmarking

### Module Loading

```typescript
export function getCapabilityModules(platformConfig: PlatformConfig) {
  const modules: CapabilityModule[] = [];

  for (const capName of platformConfig.capabilities) {
    const mod = CAPABILITY_REGISTRY[capName];
    if (mod) modules.push(mod);
  }

  return modules;
}

export function composeFromModules(modules: CapabilityModule[]) {
  const tools: Record<string, Tool> = {};
  const promptSections: string[] = [];

  for (const mod of modules) {
    Object.assign(tools, mod.tools);
    promptSections.push(mod.systemPrompt);
  }

  return { tools, systemPrompt: promptSections.join("\n\n") };
}
```

---

## 7. Provider Rules Schema

### Supabase Table

```sql
CREATE TABLE provider_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  client_id UUID,  -- NULL = org-level default
  data_need TEXT NOT NULL,  -- e.g., 'get_companies', 'get_contacts', 'get_emails', 'get_lookalikes'
  provider TEXT NOT NULL,   -- e.g., 'db_fmcsa', 'enigma', 'blitzapi', 'leadmagic', 'clay', 'discolike', 'prospeo'
  priority INTEGER NOT NULL DEFAULT 1,  -- lower = higher priority
  config JSONB,  -- optional provider-specific config overrides
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, client_id, data_need, provider)
);

-- Index for fast lookups
CREATE INDEX idx_provider_rules_org_client ON provider_rules(org_id, client_id);
CREATE INDEX idx_provider_rules_org_need ON provider_rules(org_id, data_need);
```

### Resolution Logic

```typescript
async function resolveProviderRules(
  orgId: string,
  clientId: string | null,
  dataNeed: string
): Promise<ProviderRule[]> {
  // 1. Try org + client specific
  if (clientId) {
    const specific = await db
      .from("provider_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .eq("data_need", dataNeed)
      .order("priority", { ascending: true });

    if (specific.data?.length) return specific.data;
  }

  // 2. Fall back to org-level defaults
  const orgDefaults = await db
    .from("provider_rules")
    .select("*")
    .eq("org_id", orgId)
    .is("client_id", null)
    .eq("data_need", dataNeed)
    .order("priority", { ascending: true });

  if (orgDefaults.data?.length) return orgDefaults.data;

  // 3. No rules found — DEX will use its own global defaults
  return [];
}
```

### Admin API

Simple CRUD endpoints for managing provider rules. No UI — API-only for now.

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/admin/provider-rules` | List rules (filterable by org_id, client_id, data_need) |
| `GET` | `/v1/admin/provider-rules/:id` | Get a single rule |
| `POST` | `/v1/admin/provider-rules` | Create a rule |
| `PUT` | `/v1/admin/provider-rules/:id` | Update a rule |
| `DELETE` | `/v1/admin/provider-rules/:id` | Delete a rule |
| `GET` | `/v1/admin/provider-rules/resolve` | Preview resolution for a given org_id + client_id + data_need |

All admin endpoints require a valid service token with admin scope.

---

## 8. Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js | AI SDK, assistant-ui, and assistant-stream are all TypeScript/Node packages. Maximizes compatibility. |
| **Framework** | Hono | Lean, fast, runs anywhere (Node, Bun, Deno, Cloudflare Workers). No Next.js — this is a standalone API. |
| **LLM** | Anthropic Claude via `@ai-sdk/anthropic` + `ai` (AI SDK v6) | Primary model provider. The `anthropic()` function handles Anthropic-specific message formatting, tool use, and streaming. |
| **Streaming** | `streamText().toUIMessageStreamResponse()` | Produces the exact SSE format the assistant-ui frontend runtime expects. |
| **Database** | Supabase (Postgres) | For `provider_rules` table and any future config. Consistent with the engine-x family. |
| **Secrets** | Doppler | Consistent with all engine-x services. Service tokens for downstream APIs, Anthropic API key, Supabase credentials. |
| **Deployment** | Railway | Auto-deploy on push to main. Docker-based. Consistent with all engine-x services. |
| **Auth** | JWT validation + service-to-service tokens | Platform JWTs for user identity. Doppler-managed service tokens for downstream calls. |
| **Validation** | Zod | Tool parameter schemas, request validation. Also used by the AI SDK for tool input validation. |
| **Testing** | Vitest | Fast, TypeScript-native, compatible with the Node.js ecosystem. |

### Key Dependencies

```json
{
  "ai": "^6.0.116",
  "@ai-sdk/anthropic": "^3.0.58",
  "@assistant-ui/react-ai-sdk": "^1.3.13",
  "assistant-stream": "latest",
  "hono": "^4",
  "@supabase/supabase-js": "^2",
  "zod": "^4",
  "jsonwebtoken": "^9"
}
```

Note: `@assistant-ui/react-ai-sdk` is a frontend package but exports the `frontendTools()` function used on the backend. It's a lightweight import — only the `frontendTools` utility is used.

---

## 9. Request Flow (End to End)

### Sequence Diagram

```
User                 chat-package          chat-engine-x-api         Anthropic        Data Engine X
  │                       │                       │                      │                  │
  │ types message         │                       │                      │                  │
  │──────────────────────>│                       │                      │                  │
  │                       │ POST /v1/chat         │                      │                  │
  │                       │ + headers (platform,  │                      │                  │
  │                       │   org_id, client_id,  │                      │                  │
  │                       │   auth token)         │                      │                  │
  │                       │──────────────────────>│                      │                  │
  │                       │                       │                      │                  │
  │                       │                       │ 1. Validate JWT      │                  │
  │                       │                       │ 2. Load flow config  │                  │
  │                       │                       │    (platform .md)    │                  │
  │                       │                       │ 3. Query provider    │                  │
  │                       │                       │    rules (Supabase)  │                  │
  │                       │                       │ 4. Compose system    │                  │
  │                       │                       │    prompt + tools    │                  │
  │                       │                       │                      │                  │
  │                       │                       │ streamText()         │                  │
  │                       │                       │─────────────────────>│                  │
  │                       │                       │                      │                  │
  │                       │                       │ LLM streams text +   │                  │
  │                       │  SSE: text-delta      │ tool calls           │                  │
  │                       │<──────────────────────│<─────────────────────│                  │
  │ sees streaming text   │                       │                      │                  │
  │<──────────────────────│                       │                      │                  │
  │                       │                       │                      │                  │
  │                       │                       │ LLM calls            │                  │
  │                       │                       │ searchEntities tool  │                  │
  │                       │                       │──────────────────────│─────────────────>│
  │                       │                       │                      │                  │
  │                       │                       │                      │  DEX returns     │
  │                       │                       │<─────────────────────│──────────────────│
  │                       │                       │                      │                  │
  │                       │                       │ tool result → LLM    │                  │
  │                       │                       │─────────────────────>│                  │
  │                       │                       │                      │                  │
  │                       │                       │ LLM streams final    │                  │
  │                       │  SSE: text-delta      │ response             │                  │
  │                       │<──────────────────────│<─────────────────────│                  │
  │ sees final response   │                       │                      │                  │
  │<──────────────────────│                       │                      │                  │
  │                       │  SSE: [DONE]          │                      │                  │
  │                       │<──────────────────────│                      │                  │
```

### Step-by-Step

1. **User sends a message** in a platform frontend (e.g., PaidEdge).
2. **chat-package sends POST** to chat-engine-x at `/v1/chat` with:
   - Body: `{ messages, tools, trigger, id }`
   - Headers: `Authorization` (JWT), `X-Platform` (platform ID), `X-Org-Id`, `X-Client-Id` (optional)
3. **chat-engine-x validates auth** — verifies JWT signature, extracts org_id.
4. **chat-engine-x resolves platform** → loads flow config (`.md` file) → determines which capability modules to activate.
5. **chat-engine-x resolves org x client** → queries `provider_rules` table → gets provider preferences for this org/client.
6. **chat-engine-x composes** the system prompt (flow instructions + capability module prompt sections) and tool set (capability module tools with provider preferences injected).
7. **chat-engine-x calls Anthropic** via AI SDK `streamText()` with the composed system prompt, tools, and converted message history.
8. **As the LLM streams back**, tool calls are intercepted and executed server-side — e.g., a `searchEntities` tool call triggers chat-engine-x to call DEX with the resolved provider preferences via `provider_filters`.
9. **Tool results flow back** into the LLM context for continued generation.
10. **The full response streams back** to the frontend as SSE events conforming to the UIMessage stream protocol.

---

## 10. What This PRD Does NOT Cover

| Out of Scope | Reason |
|---|---|
| Frontend changes to chat-package (configurable endpoint prop) | Separate integration task |
| Cloud auth migration from anonymous to per-user | Future work |
| UI for managing provider rules | Future work; CRUD API is sufficient for now |
| Specific content of each platform's `.md` flow file | Will be authored separately per platform |
| Migration of OEX frontend's `/api/chat` route to point at chat-engine-x | Follow-on integration task |
| Specific tool implementations for each capability module | Will be defined per-module during implementation; schemas and patterns are documented |
| Rate limiting and usage tracking per org | Future work; Anthropic API keys are shared initially |
| WebSocket or long-polling transport | SSE only; the assistant-ui protocol requires SSE |

---

## Appendix A: Environment Variables

All managed via Doppler. Service reads from `process.env` at startup.

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `CHAT_MODEL` | Model ID (default: `claude-sonnet-4-20250514`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (for provider_rules queries) |
| `DATA_ENGINE_X_URL` | Base URL for Data Engine X API |
| `DATA_ENGINE_X_TOKEN` | Service token for DEX auth |
| `CREATIVE_ENGINE_X_URL` | Base URL for Creative Engine X API |
| `CREATIVE_ENGINE_X_TOKEN` | Service token for CEX auth |
| `OUTBOUND_ENGINE_X_URL` | Base URL for Outbound Engine X API |
| `OUTBOUND_ENGINE_X_TOKEN` | Service token for OEX auth |
| `PAID_ENGINE_X_URL` | Base URL for Paid Engine X API |
| `PAID_ENGINE_X_TOKEN` | Service token for Paid Engine X auth |
| `JWT_SECRET` | Secret for validating platform JWTs (or public key path) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `PORT` | Server port (default: 8080) |
| `NODE_ENV` | `development` or `production` |

## Appendix B: Project File Structure

```
chat-engine-x-api/
├── src/
│   ├── index.ts              -- Hono app entrypoint, middleware registration
│   ├── config.ts             -- Env var loading, typed config object
│   ├── db.ts                 -- Supabase client
│   ├── middleware/
│   │   ├── auth.ts           -- JWT validation, context extraction
│   │   ├── cors.ts           -- CORS handling
│   │   ├── error-handler.ts  -- Global error handler
│   │   └── request-id.ts     -- Request ID generation
│   ├── routes/
│   │   ├── chat.ts           -- POST /v1/chat (main chat endpoint)
│   │   ├── health.ts         -- GET /health, /health/live, /health/ready
│   │   └── admin/
│   │       └── provider-rules.ts  -- CRUD for provider_rules
│   ├── flows/
│   │   ├── loader.ts         -- Reads and parses flow .md files
│   │   ├── paidedge.md       -- PaidEdge flow config
│   │   ├── outboundhq.md     -- OutboundHQ flow config
│   │   └── paidautopsy.md    -- PaidAutopsy flow config
│   ├── capabilities/
│   │   ├── index.ts          -- Module registry and loader
│   │   ├── types.ts          -- CapabilityModule interface
│   │   ├── list-building/
│   │   │   ├── tools.ts
│   │   │   ├── prompt.md
│   │   │   └── client.ts
│   │   ├── creative-generation/
│   │   │   ├── tools.ts
│   │   │   ├── prompt.md
│   │   │   └── client.ts
│   │   ├── campaign-orchestration/
│   │   │   ├── tools.ts
│   │   │   ├── prompt.md
│   │   │   └── client.ts
│   │   └── paid-campaign/
│   │       ├── tools.ts
│   │       ├── prompt.md
│   │       └── client.ts
│   └── provider-rules/
│       ├── resolver.ts       -- Provider rule resolution logic
│       └── types.ts          -- ProviderRule type
├── tests/
│   ├── routes/
│   │   ├── chat.test.ts
│   │   └── admin/
│   │       └── provider-rules.test.ts
│   ├── capabilities/
│   │   └── list-building.test.ts
│   └── provider-rules/
│       └── resolver.test.ts
├── docs/
│   ├── PRD.md               -- This document
│   ├── CHAT_PROTOCOL_REFERENCE.md
│   └── ...
├── package.json
├── tsconfig.json
├── Dockerfile
├── railway.toml
└── .env.example
```
