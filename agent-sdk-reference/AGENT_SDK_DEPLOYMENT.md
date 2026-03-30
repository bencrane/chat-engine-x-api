# Agent SDK Deployment

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [Hosting Requirements](#1-hosting-requirements)
2. [Deployment Patterns](#2-deployment-patterns)
3. [Sandbox Provider Options](#3-sandbox-provider-options)
4. [Isolation Technologies](#4-isolation-technologies)
5. [Secure Deployment](#5-secure-deployment)
6. [Permission Modes for Production](#6-permission-modes-for-production)
7. [Hooks System](#7-hooks-system)
8. [Cost Tracking](#8-cost-tracking)
9. [Budget Controls](#9-budget-controls)
10. [Todo Lists](#10-todo-lists)

---

## 1. Hosting Requirements

The Agent SDK differs from traditional stateless LLM APIs — it maintains conversational state and executes commands in a persistent environment.

### System Requirements

| Resource | Recommendation |
|----------|---------------|
| **Runtime** | Node.js 18+ (TypeScript SDK) or Python 3.10+ (Python SDK) |
| **CLI dependency** | Claude Code CLI: `npm install -g @anthropic-ai/claude-code` |
| **RAM** | 1 GiB (adjust based on task complexity) |
| **Disk** | 5 GiB (for working directory, session files, tool artifacts) |
| **CPU** | 1 CPU |
| **Network** | Outbound HTTPS to `api.anthropic.com`. Optional: access to MCP servers or external tools |

### Container-Based Sandboxing

For security and isolation, the SDK should run inside a sandboxed container environment. This provides:

- Process isolation
- Resource limits
- Network control
- Ephemeral filesystems

---

## 2. Deployment Patterns

### Pattern 1: Ephemeral Sessions

Create a new container for each user task, destroy when complete.

**Best for:** One-off tasks where the user may interact during execution but the container is destroyed after completion.

| Example | Description |
|---------|------------|
| Bug investigation & fix | Debug and resolve a specific issue |
| Invoice processing | Extract/structure data from receipts |
| Translation tasks | Translate documents between languages |
| Media processing | Transform images/video, extract metadata |

### Pattern 2: Long-Running Sessions

Maintain persistent container instances, often running multiple agent processes based on demand.

**Best for:** Proactive agents, content-serving agents, high-frequency message processing.

| Example | Description |
|---------|------------|
| Email agent | Monitor and triage incoming emails autonomously |
| Site builder | Host custom websites per user with live editing |
| Chat bots | Handle continuous message streams from Slack/Discord |

### Pattern 3: Hybrid Sessions

Ephemeral containers hydrated with history and state from a database or session resumption.

**Best for:** Intermittent interaction that kicks off work and spins down when complete, resumable.

| Example | Description |
|---------|------------|
| Project manager | Manage ongoing projects with intermittent check-ins |
| Deep research | Multi-hour research tasks, save findings, resume |
| Customer support | Handle tickets spanning multiple interactions |

### Pattern 4: Single Container

Multiple agent processes in one global container.

**Best for:** Agents that must collaborate closely. Least common — requires preventing agents from overwriting each other.

| Example | Description |
|---------|------------|
| Simulations | Agents interacting in game-like simulations |

### Decision Matrix

| Factor | Ephemeral | Long-Running | Hybrid | Single |
|--------|-----------|-------------|--------|--------|
| Isolation | Excellent | Good | Good | Poor |
| State persistence | None | Full | On-demand | Shared |
| Cost efficiency | Pay per task | Ongoing cost | Moderate | Low |
| Startup latency | Higher | None | Moderate | None |
| Complexity | Low | Medium | High | High |

---

## 3. Sandbox Provider Options

Several providers specialize in secure container environments for AI code execution:

| Provider | Description |
|----------|------------|
| **Modal Sandbox** | Demo implementation available |
| **Cloudflare Sandboxes** | Edge-deployed sandboxes |
| **Daytona** | Development environment management |
| **E2B** | Code execution sandboxes |
| **Fly Machines** | Lightweight VMs |
| **Vercel Sandbox** | Serverless-friendly sandboxing |

For self-hosted options, see [Isolation Technologies](#4-isolation-technologies).

---

## 4. Isolation Technologies

| Technology | Isolation Strength | Performance Overhead | Complexity |
|-----------|-------------------|---------------------|-----------|
| **Sandbox runtime** (`@anthropic-ai/sandbox-runtime`) | Good (secure defaults) | Very low | Low |
| **Containers (Docker)** | Setup dependent | Low | Medium |
| **gVisor** | Excellent (with correct setup) | Medium/High | Medium |
| **VMs (Firecracker, QEMU)** | Excellent (with correct setup) | High | Medium/High |

### Sandbox Runtime

Lightweight OS-level isolation without containers:

```bash
npm install @anthropic-ai/sandbox-runtime
```

- **Filesystem**: Uses OS primitives (bubblewrap on Linux, sandbox-exec on macOS) to restrict read/write access
- **Network**: Removes network namespace (Linux) or uses Seatbelt profiles (macOS) to route traffic through a built-in proxy
- **Configuration**: JSON-based allowlists for domains and filesystem paths

> **Security note**: Sandboxed processes share the host kernel. A kernel vulnerability could theoretically enable escape. The proxy allowlists domains but doesn't inspect encrypted traffic.

### Docker (Security-Hardened)

```bash
docker run \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --security-opt seccomp=/path/to/seccomp-profile.json \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \
  --tmpfs /home/agent:rw,noexec,nosuid,size=500m \
  --network none \
  --memory 2g \
  --cpus 2 \
  --pids-limit 100 \
  --user 1000:1000 \
  -v /path/to/code:/workspace:ro \
  -v /var/run/proxy.sock:/var/run/proxy.sock:ro \
  agent-image
```

| Option | Purpose |
|--------|---------|
| `--cap-drop ALL` | Remove Linux capabilities to prevent privilege escalation |
| `--security-opt no-new-privileges` | Prevent setuid privilege gain |
| `--read-only` | Immutable root filesystem |
| `--network none` | Remove all network interfaces; agent communicates via Unix socket |
| `--memory 2g` | Prevent resource exhaustion |
| `--pids-limit 100` | Prevent fork bombs |
| `--user 1000:1000` | Run as non-root user |

### gVisor

Intercepts system calls in userspace before they reach the host kernel:

```bash
docker run --runtime=runsc agent-image
```

| Workload | Overhead |
|----------|---------|
| CPU-bound computation | ~0% |
| Simple syscalls | ~2x slower |
| File I/O intensive | Up to 10-200x slower for heavy open/close |

### Virtual Machines (Firecracker)

Hardware-level isolation via CPU virtualization. Firecracker boots microVMs in under 125ms with less than 5 MiB memory overhead.

---

## 5. Secure Deployment

### Threat Model

Agents can take unintended actions due to:
- **Prompt injection**: instructions embedded in content they process (files, webpages, user input)
- **Model error**: Claude occasionally generates incorrect actions

Claude models are designed to resist prompt injection, and Opus 4.6 is the most robust frontier model. Defense in depth is still good practice.

### Built-In Security Features

| Feature | Description |
|---------|------------|
| **Permissions system** | Configure allow/block/prompt for every tool and bash command |
| **Static analysis** | Pre-execution analysis of bash commands for risky operations |
| **Web search summarization** | Search results summarized before entering context (reduces injection risk) |
| **Sandbox mode** | Bash commands can run in restricted filesystem/network environment |

### Security Principles

#### Least Privilege

| Resource | Restriction Options |
|----------|-------------------|
| Filesystem | Mount only needed directories, prefer read-only |
| Network | Restrict to specific endpoints via proxy |
| Credentials | Inject via proxy rather than exposing directly |
| System capabilities | Drop Linux capabilities in containers |

#### The Proxy Pattern

The recommended approach for credential management: run a proxy outside the agent's security boundary that injects credentials into outgoing requests.

```
Agent → Request (no credentials) → Proxy → Injects credentials → External Service
```

Benefits:
- Agent never sees actual credentials
- Proxy enforces endpoint allowlist
- All requests logged for audit
- Credentials stored in one secure location

#### Configuring Claude Code to Use a Proxy

```bash
# Option 1: ANTHROPIC_BASE_URL (Claude API requests only)
export ANTHROPIC_BASE_URL="http://localhost:8080"

# Option 2: System-wide proxy
export HTTP_PROXY="http://localhost:8080"
export HTTPS_PROXY="http://localhost:8080"
```

Proxy options: Envoy Proxy, mitmproxy, Squid, LiteLLM.

### Filesystem Configuration

**Read-only code mounting:**

```bash
docker run -v /path/to/code:/workspace:ro agent-image
```

**Files to exclude or sanitize before mounting:**

| File | Risk |
|------|------|
| `.env`, `.env.local` | API keys, database passwords |
| `~/.git-credentials` | Git passwords/tokens |
| `~/.aws/credentials` | AWS access keys |
| `~/.config/gcloud/` | Google Cloud tokens |
| `~/.docker/config.json` | Docker registry auth |
| `~/.kube/config` | Kubernetes cluster credentials |
| `.npmrc`, `.pypirc` | Package registry tokens |
| `*.pem`, `*.key` | Private keys |

### Cloud Deployment Checklist

1. Run agent containers in a private subnet with no internet gateway
2. Configure firewall rules to block all egress except to your proxy
3. Run a proxy that validates requests, enforces domain allowlists, and injects credentials
4. Assign minimal IAM permissions to the agent's service account
5. Log all traffic at the proxy for audit

---

## 6. Permission Modes for Production

| Mode | Behavior | Production Use |
|------|----------|---------------|
| `default` | Prompts for approval on file writes and shell commands | Development only |
| `acceptEdits` | Auto-approves file modifications, still prompts for shell | Good for file-centric tasks |
| `dontAsk` (TS only) | Skips tools that would need permission instead of prompting | Serverless/headless |
| `bypassPermissions` | Auto-approves everything | Only in fully sandboxed containers |
| `plan` | Read-only — no writes, no execution | Analysis and planning tasks |

**Recommendation for production:** Use `bypassPermissions` only inside hardened containers with `--network none` and read-only mounts. Use `PreToolUse` hooks for granular control over individual operations.

---

## 7. Hooks System

Hooks are callback functions that run your code in response to agent events. They intercept, modify, or block operations at key execution points.

### All Hook Events

| Hook Event | Python | TypeScript | What Triggers It | Example Use Case |
|-----------|--------|-----------|-----------------|-----------------|
| `PreToolUse` | Yes | Yes | Tool call request | Block dangerous commands |
| `PostToolUse` | Yes | Yes | Tool execution result | Log file changes to audit trail |
| `PostToolUseFailure` | Yes | Yes | Tool execution failure | Handle/log tool errors |
| `UserPromptSubmit` | Yes | Yes | User prompt submission | Inject context into prompts |
| `Stop` | Yes | Yes | Agent execution stop | Save session state |
| `SubagentStart` | Yes | Yes | Subagent initialization | Track parallel task spawning |
| `SubagentStop` | Yes | Yes | Subagent completion | Aggregate parallel results |
| `PreCompact` | Yes | Yes | Conversation compaction | Archive full transcript |
| `PermissionRequest` | Yes | Yes | Permission dialog | Custom permission handling |
| `Notification` | Yes | Yes | Agent status messages | Forward to Slack/PagerDuty |
| `SessionStart` | No | Yes | Session initialization | Initialize logging |
| `SessionEnd` | No | Yes | Session termination | Clean up resources |
| `Setup` | No | Yes | Session setup | Run initialization tasks |
| `TeammateIdle` | No | Yes | Teammate becomes idle | Reassign work |
| `TaskCompleted` | No | Yes | Background task completes | Aggregate results |
| `ConfigChange` | No | Yes | Config file changes | Reload settings |
| `WorktreeCreate` | No | Yes | Git worktree created | Track workspaces |
| `WorktreeRemove` | No | Yes | Git worktree removed | Clean up resources |

### Hook Configuration

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Refactor the auth module",
  options: {
    hooks: {
      PreToolUse: [{
        matcher: "Bash",  // Regex: only fire for Bash tool calls
        hooks: [async (input, toolUseId, context) => {
          const command = input.tool_input?.command;
          if (command?.includes("rm -rf")) {
            return {
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: "Destructive command blocked",
              }
            };
          }
          return {};
        }]
      }]
    }
  }
})) { /* handle */ }
```

```python
async def protect_env_files(input_data, tool_use_id, context):
    file_path = input_data["tool_input"].get("file_path", "")
    if file_path.split("/")[-1] == ".env":
        return {
            "hookSpecificOutput": {
                "hookEventName": input_data["hook_event_name"],
                "permissionDecision": "deny",
                "permissionDecisionReason": "Cannot modify .env files",
            }
        }
    return {}

options = ClaudeAgentOptions(
    hooks={
        "PreToolUse": [HookMatcher(matcher="Write|Edit", hooks=[protect_env_files])]
    }
)
```

### Matcher Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `matcher` | string | undefined | Regex pattern matched against tool name. MCP tools: `mcp__<server>__<action>` |
| `hooks` | HookCallback[] | — | Required. Array of callback functions |
| `timeout` | number | 60 | Timeout in seconds |

### Callback Inputs

Every callback receives three arguments:

1. **Input data**: typed object with `session_id`, `cwd`, `hook_event_name`, and event-specific fields (e.g., `tool_name`, `tool_input` for tool hooks)
2. **Tool use ID**: correlates `PreToolUse` and `PostToolUse` events for the same call
3. **Context**: `signal` (AbortSignal) in TypeScript, reserved in Python

### Callback Outputs

| Field | Location | Purpose |
|-------|----------|---------|
| `systemMessage` | Top-level | Inject a message into the conversation visible to the model |
| `continue` / `continue_` | Top-level | Whether the agent keeps running after this hook |
| `permissionDecision` | `hookSpecificOutput` | `"allow"`, `"deny"`, or `"ask"` |
| `permissionDecisionReason` | `hookSpecificOutput` | Reason string |
| `updatedInput` | `hookSpecificOutput` | Modified tool input (requires `permissionDecision: "allow"`) |
| `additionalContext` | `hookSpecificOutput` | Appended to PostToolUse result |

> Return `{}` to allow the operation without changes. When multiple hooks apply, `deny` > `ask` > `allow`.

### Async Output (Fire-and-Forget)

For side effects that don't need to block:

```python
async def async_hook(input_data, tool_use_id, context):
    asyncio.create_task(send_to_logging_service(input_data))
    return {"async_": True, "asyncTimeout": 30000}
```

### Common Hook Patterns

#### Modify Tool Input

```python
async def redirect_to_sandbox(input_data, tool_use_id, context):
    if input_data["tool_name"] == "Write":
        original_path = input_data["tool_input"].get("file_path", "")
        return {
            "hookSpecificOutput": {
                "hookEventName": input_data["hook_event_name"],
                "permissionDecision": "allow",
                "updatedInput": {
                    **input_data["tool_input"],
                    "file_path": f"/sandbox{original_path}",
                },
            }
        }
    return {}
```

#### Chain Multiple Hooks

```python
options = ClaudeAgentOptions(
    hooks={
        "PreToolUse": [
            HookMatcher(hooks=[rate_limiter]),          # First: rate limits
            HookMatcher(hooks=[authorization_check]),   # Second: permissions
            HookMatcher(hooks=[input_sanitizer]),       # Third: sanitize
            HookMatcher(hooks=[audit_logger]),          # Last: log
        ]
    }
)
```

#### Forward Notifications to Slack

```python
async def notification_handler(input_data, tool_use_id, context):
    try:
        await asyncio.to_thread(
            send_slack_notification, input_data.get("message", "")
        )
    except Exception as e:
        print(f"Failed to send notification: {e}")
    return {}

options = ClaudeAgentOptions(
    hooks={"Notification": [HookMatcher(hooks=[notification_handler])]}
)
```

---

## 8. Cost Tracking

### Total Cost per Query

The result message includes `total_cost_usd`, the cumulative cost across all steps:

```typescript
for await (const message of query({ prompt: "Summarize this project" })) {
  if (message.type === "result") {
    console.log(`Total cost: $${message.total_cost_usd}`);
  }
}
```

### Per-Step Usage (TypeScript Only)

Each assistant message contains a `BetaMessage` with `id` and `usage`. When Claude uses tools in parallel, multiple messages share the same `id` — deduplicate by ID:

```typescript
const seenIds = new Set<string>();
let totalInputTokens = 0;
let totalOutputTokens = 0;

for await (const message of query({ prompt: "Summarize this project" })) {
  if (message.type === "assistant") {
    const msgId = message.message.id;
    if (!seenIds.has(msgId)) {
      seenIds.add(msgId);
      totalInputTokens += message.message.usage.input_tokens;
      totalOutputTokens += message.message.usage.output_tokens;
    }
  }
}
```

### Per-Model Breakdown (TypeScript Only)

The result message includes `modelUsage` — useful when mixing models (e.g., Haiku subagents + Opus main agent):

```typescript
for await (const message of query({ prompt: "Summarize this project" })) {
  if (message.type !== "result") continue;

  for (const [modelName, usage] of Object.entries(message.modelUsage)) {
    console.log(`${modelName}: $${usage.costUSD.toFixed(4)}`);
    console.log(`  Input tokens: ${usage.inputTokens}`);
    console.log(`  Output tokens: ${usage.outputTokens}`);
    console.log(`  Cache read: ${usage.cacheReadInputTokens}`);
    console.log(`  Cache creation: ${usage.cacheCreationInputTokens}`);
  }
}
```

### Accumulate Across Multiple Calls

The SDK does not provide session-level totals. Accumulate manually:

```typescript
let totalSpend = 0;

for (const prompt of prompts) {
  for await (const message of query({ prompt })) {
    if (message.type === "result") {
      totalSpend += message.total_cost_usd ?? 0;
    }
  }
}

console.log(`Total spend: $${totalSpend.toFixed(4)}`);
```

### Cache Tokens

The SDK automatically uses prompt caching. The usage object includes:

| Field | Description | Cost Impact |
|-------|------------|-------------|
| `cache_creation_input_tokens` | Tokens used to create new cache entries | Higher rate |
| `cache_read_input_tokens` | Tokens read from existing cache | Reduced rate (10% of input) |
| `input_tokens` | Standard (non-cached) input tokens | Standard rate |

### Error Cases

Both success and error result messages include `usage` and `total_cost_usd`. Always read cost data from the result message regardless of its `subtype`.

---

## 9. Budget Controls

### maxBudgetUsd

Set a hard spending limit per `query()` call:

```typescript
for await (const message of query({
  prompt: "Analyze this large codebase",
  options: {
    maxBudgetUsd: 5.00,  // Stop if cost exceeds $5
    maxTurns: 50
  }
})) {
  if (message.type === "result") {
    if (message.subtype === "error_max_turns") {
      console.log("Hit turn limit");
    }
    console.log(`Spent: $${message.total_cost_usd}`);
  }
}
```

### Per-Org Budget Enforcement

For multi-tenant deployments, enforce per-organization budgets via hooks:

```typescript
const orgBudgets = new Map<string, { limit: number; spent: number }>();

hooks: {
  Stop: [{
    hooks: [async (input, toolUseId, context) => {
      const orgId = getCurrentOrgId();  // from your auth context
      const budget = orgBudgets.get(orgId);
      if (budget) {
        budget.spent += input.total_cost_usd ?? 0;
        if (budget.spent >= budget.limit) {
          return { continue: false };  // Stop the agent
        }
      }
      return {};
    }]
  }]
}
```

### Model Selection by Task Complexity

Use cheaper models for simple tasks, reserve Opus for complex work:

```typescript
function selectModel(taskComplexity: "low" | "medium" | "high"): string {
  switch (taskComplexity) {
    case "low": return "haiku";      // $1/$5 per MTok
    case "medium": return "sonnet";  // $3/$15 per MTok
    case "high": return "opus";      // $5/$25 per MTok
  }
}
```

---

## 10. Todo Lists

The SDK includes built-in todo functionality for organizing complex workflows and showing progress to users.

### Todo Lifecycle

1. **Created** as `pending` when tasks are identified
2. **Activated** to `in_progress` when work begins
3. **Completed** when the task finishes
4. **Removed** when all tasks in a group are completed

### When Todos Are Auto-Created

- Complex multi-step tasks requiring 3+ distinct actions
- User-provided task lists with multiple items
- Non-trivial operations benefiting from progress tracking
- Explicit requests for todo organization

### Monitoring Todo Changes

```typescript
for await (const message of query({
  prompt: "Optimize my app performance and track progress with todos",
  options: { maxTurns: 15 }
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use" && block.name === "TodoWrite") {
        const todos = block.input.todos;
        console.log("Todo Status Update:");
        todos.forEach((todo, index) => {
          const icon = todo.status === "completed" ? "[done]" :
                       todo.status === "in_progress" ? "[working]" : "[pending]";
          console.log(`${index + 1}. ${icon} ${todo.content}`);
        });
      }
    }
  }
}
```

### Real-Time Progress Display

```typescript
class TodoTracker {
  private todos: any[] = [];

  displayProgress() {
    if (this.todos.length === 0) return;
    const completed = this.todos.filter((t) => t.status === "completed").length;
    const total = this.todos.length;
    console.log(`Progress: ${completed}/${total} completed`);

    this.todos.forEach((todo, i) => {
      const icon = todo.status === "completed" ? "[done]" :
                   todo.status === "in_progress" ? "[working]" : "[pending]";
      const text = todo.status === "in_progress" ? todo.activeForm : todo.content;
      console.log(`${i + 1}. ${icon} ${text}`);
    });
  }

  async trackQuery(prompt: string) {
    for await (const message of query({ prompt, options: { maxTurns: 20 } })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use" && block.name === "TodoWrite") {
            this.todos = block.input.todos;
            this.displayProgress();
          }
        }
      }
    }
  }
}
```

---

## FAQ

### How do I communicate with sandboxes?

Expose ports from your container to communicate with SDK instances. Your application exposes HTTP/WebSocket endpoints for external clients while the SDK runs internally.

### What is the cost of hosting a container?

The dominant cost is tokens. Container costs vary by provisioning, but minimum is roughly $0.05/hour running.

### When should I shut down idle containers?

Tune idle timeouts based on expected user response frequency. Different sandbox providers have different criteria for spin-down.

### How long can an agent session run?

Sessions do not timeout, but set `maxTurns` to prevent the agent from getting stuck in loops.

### How often should I update the Claude Code CLI?

The CLI uses semver. Breaking changes are versioned. Check for updates periodically but test before upgrading production.

---

*Next: [Patterns](./AGENT_SDK_PATTERNS.md) · [Tools](./AGENT_SDK_TOOLS.md) · [Overview](./AGENT_SDK_OVERVIEW.md)*
