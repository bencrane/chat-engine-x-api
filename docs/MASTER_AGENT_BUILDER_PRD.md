# Master Agent Builder — Technical PRD

> Technical PRD for building a master-agent-builder — a Claude Code skill that scaffolds complete, deploy-ready agent projects from natural language descriptions.
> Date: 2026-03-30
> Status: Draft
> Author: Generated from Anthropic Agent SDK reference docs + workshop insights

---

## Design Principles

Every agent the master builder creates must encode these twelve principles. They are not suggestions — they are the architectural spine of every generated project.

1. **Gather → Act → Verify.** Every agent follows a three-phase loop. Planning is optional. Verification is not.
2. **Bash is all you need.** Composable, low-context, discoverable. Use it for everything that isn't irreversible or deeply dynamic.
3. **File system as context.** Scripts live on disk, not in the context window. Tool results save to files. Memory is a folder.
4. **Skills = progressive disclosure.** Only metadata loads at startup. Full instructions load when invoked. Keep context clean.
5. **Subagents protect context.** Search, verification, and parallel processing belong in subagents so intermediate work doesn't pollute the parent.
6. **Make problems in-distribution.** Transform your domain into something Claude already knows: spreadsheets → SQL, XLSX → XML, custom APIs → TypeScript SDKs.
7. **Reversibility determines agent fit.** Highly reversible work (code, files) is excellent. Low reversibility (UI clicks) needs careful checkpointing.
8. **The ~50-line agent.** The entry file is small. The work lives in CLAUDE.md, skills, scripts, and data folders.
9. **Prototype in Claude Code, productionize with SDK.** Chat with it. Read the transcript. Iterate. Then write the agent.ts.
10. **Hooks for deterministic guardrails.** Verify after every write. Enforce chunk limits. Force scripts before responses. Insert determinism at every step.
11. **Agent SDK = Production Claude Code.** Same loop, same tools, same skills — as a library with sessions, cost tracking, and permissions.
12. **Universal architecture.** Agent loop + runtime environment + MCP servers + skills library. New vertical = new MCP servers + new skills.

---

## 1. System Overview

### What It Is

The **master-agent-builder** is a Claude Code skill (`/build-agent`) that accepts a natural language description of a domain, API surface, and use case, then scaffolds a complete, opinionated agent project repository. The output is deploy-ready: it includes a CLAUDE.md, skills, tools, hooks, subagent definitions, an agent entry file, Dockerfile, railway.toml, and Doppler integration.

### Who Uses It

Developers building agents on the Anthropic stack who want to go from "I need an agent that does X" to a working project in minutes instead of days. The builder encodes best practices so developers don't have to read 21,000 words of SDK documentation.

### What It Produces

A git-initialized directory containing:

- A working `agent.ts` entry file (~50 lines)
- A CLAUDE.md encoding the agent loop, bash-first philosophy, and domain context
- Domain-specific skills in `.claude/skills/`
- Custom tools bundled as in-process MCP servers
- Hooks for verification, auditing, and cost control
- Subagent definitions for search, verification, and parallel processing
- Deployment configuration (Dockerfile, railway.toml, Doppler)
- A test harness and transcript review tooling

### What It Does NOT Produce

- Production data or credentials (scaffolds Doppler config, doesn't populate secrets)
- Frontend code (agents are backend services)
- MCP server implementations for third-party services (references existing packages)

---

## 2. Invocation Interface

### Skill Definition

The builder lives at `.claude/skills/build-agent/SKILL.md`:

```markdown
---
name: Master Agent Builder
description: Scaffold a complete, deploy-ready agent project from a natural language
  description. Use when the user wants to create a new agent, build an agent project,
  or scaffold agent infrastructure. Encodes Anthropic best practices including bash-first
  philosophy, file-system-as-context, progressive skill disclosure, and the Gather-Act-Verify
  agent loop.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent
---
```

### Invocation Methods

| Method | Example |
|:-------|:--------|
| Slash command | `/build-agent` |
| Natural language | "Build me an agent that processes invoices" |
| With arguments | `/build-agent invoice-processor --domain "accounts payable" --deploy railway` |

### Allowed Tools

The builder itself uses:

- **Read, Glob, Grep** — discover existing code, APIs, and data sources
- **Write, Edit** — scaffold project files
- **Bash** — initialize git, install dependencies, run validation
- **AskUserQuestion** — collect missing input dimensions
- **Agent** — delegate research (API discovery, SDK generation) to subagents

---

## 3. Input Specification

The builder collects six input dimensions. Collection is conversational — the builder asks clarifying questions via `AskUserQuestion` when inputs are missing or ambiguous.

### Input Dimensions

| Dimension | Required | Description | Example |
|:----------|:---------|:------------|:--------|
| **Domain** | Yes | Natural language description of what the agent does | "Process invoice PDFs, extract line items, reconcile against POs" |
| **API Surface** | No | URLs, SDK repos, OpenAPI specs, or "discover it" | `https://api.stripe.com`, `@anthropic-ai/sdk`, "go discover the Xero API" |
| **Data Sources** | No | Files, databases, APIs the agent reads from | "Supabase postgres", "S3 bucket with PDFs", "/data/reference.csv" |
| **Verification Strategy** | No | Deterministic checks the agent should run | "Sum of line items must match invoice total", "JSON schema validation" |
| **Agent vs Workflow** | No | Free-form reasoning or structured I/O? | "Free-form" (default) or "Structured: input schema → output schema" |
| **Deployment Target** | No | Where the agent runs | "Railway+Doppler" (default), "local", "Cloudflare", "Modal", "E2B" |

### Defaults

When optional inputs are omitted:

- **API Surface**: Builder searches for OpenAPI specs, README files, and SDK packages related to the domain
- **Data Sources**: Builder scaffolds a `data/` directory with placeholder instructions
- **Verification Strategy**: Builder generates default hooks (lint, type-check, JSON schema validation)
- **Agent vs Workflow**: Defaults to free-form agent with optional structured output
- **Deployment Target**: Defaults to Railway + Doppler (matching the engine-x pattern)

### Input Validation

The builder validates inputs before scaffolding:

1. Domain description must be at least 10 words
2. API URLs must be reachable (builder tests with `curl -s -o /dev/null -w "%{http_code}"`)
3. OpenAPI specs must parse as valid JSON/YAML
4. Deployment target must be a supported provider

---

## 4. Output Specification

### Scaffolded Repo Structure

```
{{PROJECT_NAME}}/
├── agent.ts                    # ~50-line entry file (Principle 8)
├── CLAUDE.md                   # Agent identity + loop instructions (Principle 3)
├── package.json                # Dependencies: @anthropic-ai/claude-agent-sdk, zod, etc.
├── tsconfig.json               # TypeScript strict mode
├── Dockerfile                  # Multi-stage build + Doppler (Principle 11)
├── railway.toml                # Railway deployment config
├── .env.example                # Required env vars (never committed with values)
├── .gitignore
│
├── .claude/
│   ├── skills/                 # Domain-specific skills (Principle 4)
│   │   ├── search/
│   │   │   └── SKILL.md
│   │   ├── verify/
│   │   │   └── SKILL.md
│   │   └── {{DOMAIN_SKILL}}/
│   │       └── SKILL.md
│   │
│   └── agents/                 # Subagent definitions (Principle 5)
│       ├── researcher.md
│       └── verifier.md
│
├── src/
│   ├── tools/                  # Custom tools via MCP (Principle 2 decision tree)
│   │   ├── index.ts            # Tool registry + createSdkMcpServer()
│   │   └── {{DOMAIN_TOOL}}.ts  # Domain-specific tool definitions
│   │
│   ├── hooks/                  # Deterministic guardrails (Principle 10)
│   │   ├── index.ts            # Hook registry
│   │   ├── verify.ts           # Verify-after-write hook
│   │   ├── audit.ts            # Audit logging hook
│   │   └── cost.ts             # Cost threshold hook
│   │
│   └── config.ts               # Environment config (Doppler-injected)
│
├── scripts/                    # Bash tools for discovery (Principle 2)
│   ├── search.sh               # Domain-specific search script
│   ├── validate.sh             # Validation script
│   └── setup.sh                # One-time setup script
│
├── data/                       # Reference data, scratch pads (Principle 3)
│   └── README.md               # Instructions for populating data
│
├── memory/                     # Agent memory folder (Principle 3)
│   └── .gitkeep
│
└── tests/
    ├── tools.test.ts           # Unit tests for custom tools
    └── agent.test.ts           # Integration test for agent flow
```

### File Manifest

| File | Purpose | Generated From |
|:-----|:--------|:---------------|
| `agent.ts` | Entry point — ~50 lines calling `query()` with composed options | Domain + API surface + deployment target |
| `CLAUDE.md` | Agent identity, loop instructions, domain context | Domain description + verification strategy |
| `.claude/skills/*/SKILL.md` | Progressive context disclosure for domain expertise | Domain + API surface |
| `.claude/agents/*.md` | Subagent definitions with specialized prompts | Domain complexity analysis |
| `src/tools/*.ts` | Custom tools for irreversible actions (API calls, DB writes) | API surface + data sources |
| `src/hooks/*.ts` | Deterministic guardrails | Verification strategy |
| `scripts/*.sh` | Bash utilities for composable actions | Domain + data sources |
| `Dockerfile` | Multi-stage Node.js 20 + Doppler | Deployment target |
| `railway.toml` | Railway deployment config | Deployment target |

### The ~50-Line Agent Entry File

```typescript
// agent.ts — the entry point is small; the work lives in the file system
import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { tools } from "./src/tools/index.js";
import { hooks } from "./src/hooks/index.js";
import { config } from "./src/config.js";

const mcpServer = createSdkMcpServer({
  name: "{{PROJECT_NAME}}",
  tools,
});

const agents = {
  researcher: {
    description: "{{RESEARCHER_DESCRIPTION}}",
    prompt: "{{RESEARCHER_PROMPT}}",
    tools: ["Read", "Grep", "Glob", "Bash", "WebSearch"],
    model: "sonnet" as const,
  },
  verifier: {
    description: "{{VERIFIER_DESCRIPTION}}",
    prompt: "{{VERIFIER_PROMPT}}",
    tools: ["Read", "Grep", "Bash"],
    model: "sonnet" as const,
  },
};

export async function runAgent(prompt: string, sessionId?: string) {
  const stream = query({
    prompt,
    options: {
      model: config.model,
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["project"],
      mcpServers: { tools: mcpServer },
      allowedTools: [
        "Read", "Glob", "Grep", "Bash", "Agent", "Skill",
        ...tools.map((t) => `mcp__tools__${t.name}`),
      ],
      agents,
      hooks,
      permissionMode: "dontAsk",
      maxBudgetUsd: config.maxBudgetUsd,
      maxTurns: config.maxTurns,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  });

  return stream;
}
```

---

## 5. CLAUDE.md Template

The CLAUDE.md is the agent's identity and operating manual. The builder generates it from a parameterized template.

### Template

```markdown
# {{AGENT_NAME}}

> {{AGENT_DESCRIPTION}}

## Identity

You are {{AGENT_ROLE}}. Your job is to {{PRIMARY_TASK}}.

## The Loop

Follow this loop for every task:

### 1. Gather Context
- Use bash tools (grep, find, curl) to discover what you need
- Read files from `data/` for reference material
- Search with scripts in `scripts/` — don't load everything into context
- Use the `researcher` subagent for complex discovery tasks

### 2. Act
- {{ACTION_INSTRUCTIONS}}
- Save intermediate results to files, not to context
- For API calls, use the custom tools in `src/tools/`
- For composable operations, use bash scripts in `scripts/`
- Write results to `data/` with descriptive filenames

### 3. Verify
- Run verification after EVERY action, not just at the end
- {{VERIFICATION_INSTRUCTIONS}}
- Use the `verifier` subagent for adversarial review
- Deterministic checks (linting, schema validation, checksums) are always preferred over LLM-based verification

## Rules

### Bash First
- If it's composable (search, filter, transform, validate), use bash
- If it's irreversible (API write, DB mutation, send email), use a custom tool
- If it's deeply dynamic (compose multi-source data, novel analysis), use codegen
- Save bash output to files with `> output.txt` — don't pollute context

### File System as Memory
- Write discoveries to `memory/` for recall across sessions
- Save long outputs to `data/` and return the file path
- Scripts in `scripts/` are your reusable tools — check there before writing new ones
- State lives in files, not in chat history

### Context Efficiency
- Delegate search tasks to the `researcher` subagent
- Delegate verification to the `verifier` subagent
- Don't read entire large files — use grep to find what you need
- When context gets long, save a summary to file and start fresh

{{DOMAIN_SPECIFIC_RULES}}

## Available Tools

### Custom Tools (via MCP)
{{TOOL_DESCRIPTIONS}}

### Scripts (via Bash)
{{SCRIPT_DESCRIPTIONS}}

### Skills
{{SKILL_DESCRIPTIONS}}

## Data Sources
{{DATA_SOURCE_DESCRIPTIONS}}

## Environment
- Model: {{MODEL}}
- Budget: ${{MAX_BUDGET_USD}} per query
- Max turns: {{MAX_TURNS}}
- Deployment: {{DEPLOYMENT_TARGET}}
```

### Example: Filled Template for Invoice Processing Agent

```markdown
# Invoice Processor

> AI agent that extracts data from invoice PDFs, validates against purchase orders, and reconciles accounts.

## Identity

You are an accounts payable automation specialist. Your job is to process invoice PDFs, extract structured data, validate against purchase orders in the database, and flag discrepancies for human review.

## The Loop

### 1. Gather Context
- Use `scripts/search.sh` to find relevant POs in the database
- Read the invoice PDF using `pdftotext` via bash
- Check `memory/` for previously processed invoices from this vendor

### 2. Act
- Extract line items using the `extract_invoice` tool
- Match against POs using the `match_po` tool
- Write reconciliation results to `data/reconciliation_{invoice_id}.json`

### 3. Verify
- Run `scripts/validate.sh` to check: line item sum == invoice total
- Verify PO numbers exist in the database
- Use the `verifier` subagent to review the extraction for errors
- Flag any discrepancy > $0.01 for human review

## Rules

### Bash First
...

### Domain-Specific Rules
- Never auto-approve invoices over $10,000
- Always cross-reference vendor TIN against the approved vendor list
- Save extraction confidence scores to `data/confidence/`
- If OCR confidence < 0.85, flag for manual review
```

---

## 6. Skill Generation

The builder generates three default skills plus domain-specific skills.

### Default Skills

#### Search Skill

```markdown
---
name: Domain Search
description: Search for {{DOMAIN_ENTITIES}} across configured data sources.
  Use when the agent needs to find, look up, or discover {{DOMAIN_ENTITIES}}.
allowed-tools: Bash, Grep, Read
---

Search for {{DOMAIN_ENTITIES}} using the available tools:

1. Check `data/` for cached/reference data first
2. Use `scripts/search.sh` for external searches
3. Use grep to search across local files
4. Save results to `data/search_results_{timestamp}.json`
5. Return a summary with file path for full results
```

#### Verify Skill

```markdown
---
name: Verification
description: Verify the quality and correctness of agent output. Use after
  every action that produces results.
allowed-tools: Bash, Read, Grep
---

Run all applicable verification checks:

1. **Schema validation**: Run `scripts/validate.sh` on output files
2. **Deterministic checks**: {{DETERMINISTIC_CHECKS}}
3. **Cross-reference**: Compare against source data in `data/`
4. **Completeness**: Ensure all required fields are populated
5. Log results to `data/verification_{timestamp}.json`
```

#### Codegen Skill

```markdown
---
name: Code Generation
description: Generate code for dynamic, novel tasks that can't be handled by
  bash scripts or existing tools. Use sparingly — prefer bash for composable operations.
allowed-tools: Write, Edit, Bash, Read
---

When generating code:

1. Check if a bash script in `scripts/` already handles this
2. If not, write a focused script (not a full application)
3. Save to `scripts/` for reuse
4. Test immediately with `bash scripts/your_script.sh`
5. Add to `scripts/README.md` for documentation
```

### Domain-Specific Skill Generation

The builder analyzes the domain description and API surface to generate additional skills. The decision logic:

| Input Signal | Generated Skill |
|:-------------|:----------------|
| API surface includes REST endpoints | API interaction skill with curl patterns |
| Data sources include databases | SQL query skill with schema reference |
| Domain involves documents/files | Document processing skill with extraction patterns |
| Verification strategy mentions specific rules | Domain-specific validation skill |
| Multiple data sources | Data aggregation/correlation skill |

---

## 7. Tool Generation

### Decision Tree: Tool vs Bash vs Codegen

```
Is the action irreversible? (send email, write to prod DB, create record)
  → YES: Create a custom tool with tool() + createSdkMcpServer()
  → NO: ↓

Is the action composable? (search, filter, transform, validate, pipe)
  → YES: Write a bash script in scripts/
  → NO: ↓

Is the action dynamic and novel? (compose APIs, data analysis, research)
  → YES: Let the agent use codegen (Write tool + Bash to execute)
  → NO: Use a built-in tool (Read, Grep, Glob, WebSearch)
```

### Tool Definition Template

```typescript
// src/tools/{{TOOL_NAME}}.ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { config } from "../config.js";

export const {{TOOL_NAME}} = tool(
  "{{tool_name_snake_case}}",
  "{{TOOL_DESCRIPTION}}. {{WHEN_TO_USE}}.",
  {
    // Input schema — be specific with descriptions
    {{SCHEMA_FIELDS}}
  },
  async (args) => {
    try {
      {{TOOL_IMPLEMENTATION}}

      // Save full response to file, return summary (Principle 3)
      const outputPath = `data/{{tool_name}}_${Date.now()}.json`;
      await writeFile(outputPath, JSON.stringify(result, null, 2));

      return {
        content: [{
          type: "text" as const,
          text: `{{SUCCESS_SUMMARY}}. Full results saved to ${outputPath}`,
        }],
      };
    } catch (err) {
      // Graceful failure — agent can retry or adjust (Principle 10)
      return {
        content: [{
          type: "text" as const,
          text: `{{TOOL_NAME}} failed: ${err instanceof Error ? err.message : "Unknown error"}. Try adjusting parameters.`,
        }],
        isError: true,
      };
    }
  },
  {
    annotations: {
      readOnlyHint: {{READ_ONLY}},
      destructiveHint: {{DESTRUCTIVE}},
      idempotentHint: {{IDEMPOTENT}},
      openWorldHint: {{OPEN_WORLD}},
    },
  }
);
```

### Tool Registry

```typescript
// src/tools/index.ts
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
{{TOOL_IMPORTS}}

export const tools = [{{TOOL_LIST}}];

export const mcpServer = createSdkMcpServer({
  name: "{{PROJECT_NAME}}",
  tools,
});
```

---

## 8. Hook Generation

### Default Hooks (Always Generated)

#### Verify-After-Write Hook

```typescript
// src/hooks/verify.ts
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

export const verifyAfterWrite: HookCallback = async (input, toolUseId) => {
  if (input.tool_name === "Write" || input.tool_name === "Edit") {
    const filePath = input.tool_input?.file_path;
    return {
      systemMessage: `File written: ${filePath}. Run verification before proceeding.`,
    };
  }
  return {};
};
```

#### Audit Logging Hook

```typescript
// src/hooks/audit.ts
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

export const auditLog: HookCallback = async (input, toolUseId) => {
  console.log(JSON.stringify({
    event: input.hook_event_name,
    tool: input.tool_name,
    session: input.session_id,
    timestamp: new Date().toISOString(),
    toolUseId,
  }));
  return {};
};
```

#### Cost Threshold Hook

```typescript
// src/hooks/cost.ts
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";

let accumulatedCost = 0;

export const costThreshold: HookCallback = async (input) => {
  if (input.hook_event_name === "Stop" && input.total_cost_usd) {
    accumulatedCost += input.total_cost_usd;
    if (accumulatedCost > config.maxBudgetUsd * 0.8) {
      return {
        systemMessage: `Warning: Session cost is $${accumulatedCost.toFixed(2)} (80% of budget). Be concise.`,
      };
    }
  }
  return {};
};
```

#### Chunk Size Limit Hook

```typescript
// src/hooks/chunk.ts
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

const MAX_WRITE_LINES = 1000;

export const chunkSizeLimit: HookCallback = async (input) => {
  if (input.tool_name === "Write") {
    const content = input.tool_input?.content as string;
    const lineCount = content?.split("\n").length ?? 0;
    if (lineCount > MAX_WRITE_LINES) {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `File too large (${lineCount} lines). Break into chunks of ${MAX_WRITE_LINES} lines or less.`,
        },
      };
    }
  }
  return {};
};
```

### Hook Registry

```typescript
// src/hooks/index.ts
import { verifyAfterWrite } from "./verify.js";
import { auditLog } from "./audit.js";
import { costThreshold } from "./cost.js";
import { chunkSizeLimit } from "./chunk.js";

export const hooks = {
  PreToolUse: [
    { matcher: "Write|Edit", hooks: [chunkSizeLimit] },
    { hooks: [auditLog] },
  ],
  PostToolUse: [
    { matcher: "Write|Edit", hooks: [verifyAfterWrite] },
    { hooks: [auditLog] },
  ],
  Stop: [
    { hooks: [costThreshold] },
  ],
};
```

### Domain-Specific Hook Generation

The builder generates additional hooks based on the verification strategy:

| Verification Signal | Generated Hook |
|:-------------------|:---------------|
| "must match total" | Sum validation hook on PostToolUse |
| "schema validation" | JSON Schema check hook on PostToolUse |
| "never modify X" | PreToolUse deny hook for protected paths |
| "rate limit" | PreToolUse rate limiter for external API calls |
| "approval required" | PreToolUse hook that pauses for human approval |

---

## 9. Subagent Architecture

### Default Subagent Patterns

Every scaffolded project includes two default subagents and optionally a third for parallel processing.

#### Researcher Subagent

```markdown
---
description: Research and discovery specialist. Use when you need to search for
  information, explore APIs, read documentation, or gather context for a task.
  Delegates search work to keep the main agent's context clean.
tools: Read, Grep, Glob, Bash, WebSearch, WebFetch
model: sonnet
---

You are a research specialist. Your job is to find information efficiently.

When researching:
1. Start with local files (grep, glob) before web search
2. Save all findings to files in data/ with descriptive names
3. Return a concise summary — the main agent doesn't need your intermediate steps
4. Include file paths to full results so the main agent can drill down if needed

Be thorough but concise. Quality of findings matters more than quantity.
```

#### Verifier Subagent (Adversarial — Principle 5)

```markdown
---
description: Adversarial verification specialist. Use after completing work to
  get an independent quality check. This agent has NO sympathy for your work —
  it will critique ruthlessly.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior QA analyst reviewing work produced by a junior team member.
Assume the work contains errors until proven otherwise.

When verifying:
1. Read the output files carefully
2. Cross-reference against source data and requirements
3. Run all available validation scripts in scripts/
4. Check for:
   - Missing data or incomplete processing
   - Incorrect calculations or transformations
   - Schema violations
   - Edge cases that were likely missed
5. Return a verdict: PASS, FAIL, or NEEDS_REVIEW with specific issues

Be harsh. False positives are acceptable. False negatives are not.
```

#### Parallel Processing Subagent (Optional)

Generated when the domain involves batch processing (multiple files, multiple records, multiple data sources):

```markdown
---
description: Parallel processing worker. Use when you need to process multiple
  items independently. Each invocation handles one item from a batch.
tools: Read, Write, Bash, {{DOMAIN_TOOLS}}
model: haiku
---

You are a batch processing worker. You process exactly ONE item per invocation.

Input: You will receive a specific item to process (file path, record ID, URL, etc.)
Output: Save results to data/batch/{item_id}.json and return a summary.

Rules:
- Process only the item you're given — nothing more
- Save results to the designated output path
- Return success/failure status with any error details
- Do not modify shared state — write only to your designated output file
```

### Model Selection Per Subagent Role

| Role | Model | Rationale |
|:-----|:------|:----------|
| Orchestrator (main) | Opus 4.6 or Sonnet 4.6 | Needs strong planning and reasoning |
| Researcher | Sonnet 4.6 | Needs good judgment about relevance |
| Verifier | Sonnet 4.6 | Needs critical analysis capability |
| Batch worker | Haiku 4.5 | Simple, repetitive tasks — optimize for cost |

### When to Use Subagents vs Single Agent

| Scenario | Approach |
|:---------|:---------|
| Single-domain, linear task | Single agent |
| Task requires research phase | Main + researcher subagent |
| Output needs quality verification | Main + verifier subagent |
| Batch processing (>5 items) | Main + parallel worker subagents |
| Cross-domain orchestration | Orchestrator (Opus) + domain worker subagents (Sonnet) |

---

## 10. Deployment Scaffolding

### Dockerfile Template

Matches the engine-x pattern: multi-stage build with Doppler runtime secrets injection.

```dockerfile
# --- Build stage ---
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY agent.ts ./

RUN npm run build

# --- Runtime stage ---
FROM node:20-slim AS runtime

WORKDIR /app

# Install Doppler CLI for runtime secrets injection
RUN apt-get update && apt-get install -y \
    apt-transport-https ca-certificates curl gnupg \
    && curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
       'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \
       gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" > \
       /etc/apt/sources.list.d/doppler-cli.list \
    && apt-get update && apt-get install -y doppler \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (required by Agent SDK)
RUN npm install -g @anthropic-ai/claude-code

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY CLAUDE.md ./
COPY .claude/ ./.claude/
COPY scripts/ ./scripts/
COPY data/ ./data/

EXPOSE 8080

CMD ["doppler", "run", "--", "node", "dist/agent.js"]
```

### railway.toml Template

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health/live"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Doppler Configuration

The builder scaffolds a `.env.example` with required variables and instructions:

```bash
# Required: Anthropic API key for Agent SDK
ANTHROPIC_API_KEY=

# Optional: Model override (default: claude-sonnet-4-6)
AGENT_MODEL=claude-sonnet-4-6

# Optional: Budget controls
MAX_BUDGET_USD=2.00
MAX_TURNS=20

# Domain-specific secrets (populated via Doppler)
# {{DOMAIN_SECRETS}}
```

### Sandbox Provider Configs

When the deployment target is not Railway, the builder generates provider-specific configuration:

| Provider | Generated Files |
|:---------|:---------------|
| Cloudflare | `wrangler.toml`, worker entry point |
| Modal | `modal_config.py`, Dockerfile adjustments |
| E2B | `e2b.toml`, sandbox configuration |
| Local | `docker-compose.yml` for local development |

---

## 11. Testing Strategy

### Three Testing Layers

#### 1. Tool Unit Tests

```typescript
// tests/tools.test.ts
import { describe, it, expect } from "vitest";
import { tools } from "../src/tools/index.js";

describe("custom tools", () => {
  for (const t of tools) {
    it(`${t.name} should return valid CallToolResult on success`, async () => {
      const result = await t.handler(/* mock args */);
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
    });

    it(`${t.name} should return isError on failure`, async () => {
      const result = await t.handler(/* invalid args */);
      expect(result.isError).toBe(true);
    });
  }
});
```

#### 2. Agent Integration Tests

```typescript
// tests/agent.test.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { describe, it, expect } from "vitest";

describe("agent flow", () => {
  it("should complete a basic task within budget", async () => {
    let result;
    for await (const msg of query({
      prompt: "{{TEST_PROMPT}}",
      options: {
        maxTurns: 5,
        maxBudgetUsd: 0.50,
        permissionMode: "bypassPermissions",
      },
    })) {
      if (msg.type === "result") result = msg;
    }

    expect(result?.subtype).toBe("success");
    expect(result?.total_cost_usd).toBeLessThan(0.50);
  });
});
```

#### 3. Transcript Review

The builder generates a `scripts/review-transcript.sh` that:

1. Runs the agent against 3-5 test prompts
2. Saves full transcripts to `data/transcripts/`
3. Extracts key metrics: turns used, tools called, cost, success/failure
4. Outputs a summary table for human review

```bash
#!/bin/bash
# scripts/review-transcript.sh — Run test prompts and review agent behavior
set -euo pipefail

PROMPTS=(
  "{{TEST_PROMPT_1}}"
  "{{TEST_PROMPT_2}}"
  "{{TEST_PROMPT_3}}"
)

mkdir -p data/transcripts

for i in "${!PROMPTS[@]}"; do
  echo "Running test $((i+1))/${#PROMPTS[@]}: ${PROMPTS[$i]:0:50}..."
  node dist/agent.js --prompt "${PROMPTS[$i]}" --max-turns 10 --max-budget 1.00 \
    > "data/transcripts/test_$((i+1)).json" 2>&1
  echo "  Done. Transcript saved."
done

echo ""
echo "=== Transcript Summary ==="
for f in data/transcripts/test_*.json; do
  echo "$(basename $f):"
  jq -r '"  Turns: \(.turns) | Cost: $\(.cost) | Status: \(.status)"' "$f" 2>/dev/null || echo "  (parse error)"
done
```

### The Prototype-to-Productionize Workflow

1. **Give Claude Code the scaffolded project** — open the directory, let it read CLAUDE.md
2. **Chat with it** — ask it to do the task described in the domain
3. **Watch what it does** — which tools does it reach for? What scripts does it write?
4. **Read the transcript** — save with `/compact`, review the trace
5. **Iterate** — update CLAUDE.md, add skills, refine scripts based on what you observed
6. **Once it works locally** — the agent.ts is already written; deploy to Railway

---

## 12. Skill Self-Improvement

### Pattern Tracking Across Builds

The master builder maintains a `memory/` directory at `~/.claude/skills/build-agent/memory/` that records:

- **Common patterns**: Which tool/bash/codegen decisions work best for which domain types
- **Failure modes**: Which scaffolding patterns produce agents that fail on first run
- **User modifications**: What users change after scaffolding (indicates gaps in generation)

### Skill Versioning

Each generated skill includes a version in its frontmatter:

```yaml
---
name: Domain Search
version: 1.0.0
generated-by: master-agent-builder
generated-at: 2026-03-30T00:00:00Z
---
```

The builder checks for newer versions of its templates on each invocation and suggests upgrades when patterns have improved.

### Feedback Loop

```
Build agent → Observe transcript → Update builder skills → Build better agent
     ↑                                                              |
     └──────────────────────────────────────────────────────────────┘
```

The builder records:
1. **What it generated** — snapshot of all template decisions
2. **What the user changed** — diff between scaffolded and final state
3. **What worked** — transcript success metrics from test runs

This data feeds back into the builder's decision trees (Section 7's tool/bash/codegen tree, Section 9's subagent selection, Section 6's skill generation).

### Distribution

Generated skills that prove useful can be:
1. **Shared via git** — the `.claude/skills/` directory is version-controlled
2. **Published as plugins** — bundle skills + agents + hooks into a plugin package
3. **Contributed upstream** — patterns that generalize well can be contributed to the Anthropic skills repo

### The Meta-Skill

The master builder is itself a skill. It follows its own principles:
- Its SKILL.md uses progressive disclosure (Principle 4)
- It delegates research to subagents (Principle 5)
- It uses bash for composable scaffolding operations (Principle 2)
- Its memory is a folder (Principle 3)
- It verifies generated projects before returning them (Principle 1)

---

## Appendix A: Agent SDK Quick Reference

| Concept | SDK Surface | Reference |
|:--------|:-----------|:----------|
| Agent loop | `query()` → async iterable | `AGENT_SDK_OVERVIEW.md` §3 |
| Custom tools | `tool()` + `createSdkMcpServer()` | `AGENT_SDK_TOOLS.md` §2 |
| Built-in tools | Read, Write, Edit, Bash, Glob, Grep, etc. | `AGENT_SDK_TOOLS.md` §1 |
| Permissions | `allowedTools`, `permissionMode`, `canUseTool` | `AGENT_SDK_TOOLS.md` §5-6 |
| Sessions | `resume`, `continue`, `forkSession` | `AGENT_SDK_SESSIONS.md` §3-6 |
| Streaming | `includePartialMessages`, `StreamEvent` | `AGENT_SDK_STREAMING.md` §4-9 |
| Skills | `.claude/skills/SKILL.md`, `settingSources` | `AGENT_SDK_SKILLS_AND_PROMPTS.md` §8-9 |
| Subagents | `agents` parameter, `.claude/agents/*.md` | `AGENT_SDK_SUBAGENTS.md` §2-6 |
| Hooks | `PreToolUse`, `PostToolUse`, `Stop`, etc. | `AGENT_SDK_DEPLOYMENT.md` §7 |
| Cost tracking | `total_cost_usd`, `modelUsage`, `maxBudgetUsd` | `AGENT_SDK_DEPLOYMENT.md` §8-9 |
| Deployment | `permissionMode: "dontAsk"`, Dockerfile, Railway | `AGENT_SDK_DEPLOYMENT.md` §1-6 |

## Appendix B: Models and Pricing

| Model | Input | Output | Context | Best For |
|:------|:------|:-------|:--------|:---------|
| Opus 4.6 | $5/MTok | $25/MTok | 1M tokens | Complex orchestration, multi-step reasoning |
| Sonnet 4.6 | $3/MTok | $15/MTok | 1M tokens | General agents, research, verification |
| Haiku 4.5 | $1/MTok | $5/MTok | 200k tokens | Batch workers, simple lookups, classification |

## Appendix C: Linear Project Reference

The implementation of this PRD is tracked in the Linear project **"Master Agent Builder"** in the `api-chex` workspace. See the project for the full issue decomposition across 6 phases:

1. **Phase 1: Foundation** — Research, define structures, templates
2. **Phase 2: Core Builder Logic** — Input collection, scaffolding, generation
3. **Phase 3: Subagent & Advanced Patterns** — Subagent definitions, parallel processing
4. **Phase 4: Deployment & Infrastructure** — Dockerfile, Railway, Doppler, sandbox providers
5. **Phase 5: Testing & Iteration** — Test harness, reference builds, transcript review
6. **Phase 6: Self-Improvement & Distribution** — Versioning, feedback loop, meta-skill
