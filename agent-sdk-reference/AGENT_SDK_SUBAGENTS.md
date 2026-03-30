# Agent SDK Subagents

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [Why Subagents](#1-why-subagents)
2. [Three Creation Methods](#2-three-creation-methods)
3. [AgentDefinition Configuration](#3-agentdefinition-configuration)
4. [Programmatic Subagents](#4-programmatic-subagents)
5. [Filesystem-Based Subagents](#5-filesystem-based-subagents)
6. [Built-In General-Purpose Subagent](#6-built-in-general-purpose-subagent)
7. [Inheritance](#7-inheritance)
8. [Invocation Patterns](#8-invocation-patterns)
9. [Dynamic Agent Configuration](#9-dynamic-agent-configuration)
10. [Resuming Subagents](#10-resuming-subagents)
11. [Tool Restriction Patterns](#11-tool-restriction-patterns)
12. [Subagent Hooks](#12-subagent-hooks)
13. [Gotchas and Constraints](#13-gotchas-and-constraints)

---

## 1. Why Subagents

Subagents are separate agent instances that your main agent can spawn to handle focused subtasks. They provide four key benefits:

| Benefit | Description |
|---------|------------|
| **Context isolation** | Each subagent runs in its own fresh conversation. Intermediate tool calls and results stay inside the subagent; only its final message returns to the parent. |
| **Parallelization** | Multiple subagents can run concurrently, dramatically speeding up complex workflows. |
| **Specialized instructions** | Each subagent can have tailored system prompts with specific expertise, best practices, and constraints. |
| **Tool restrictions** | Subagents can be limited to specific tools, reducing the risk of unintended actions. |

---

## 2. Three Creation Methods

| Method | How | When to Use |
|--------|-----|------------|
| **Programmatic** | `agents` parameter in `query()` options | Recommended. Full control in code. |
| **Filesystem-based** | Markdown files in `.claude/agents/` | Shared team agents, version-controlled definitions |
| **Built-in general-purpose** | Always available via the Agent tool | No configuration needed; Claude uses it automatically for subtask delegation |

Programmatically defined agents take precedence over filesystem-based agents with the same name.

---

## 3. AgentDefinition Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | Yes | Natural language description of when to use this agent. Claude uses this to decide when to delegate. |
| `prompt` | string | Yes | The agent's system prompt defining its role and behavior. |
| `tools` | string[] | No | Array of allowed tool names. If omitted, inherits all tools from parent. |
| `model` | `'sonnet'` \| `'opus'` \| `'haiku'` \| `'inherit'` | No | Model override for this agent. |

### TypeScript

```typescript
import { query, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

const codeReviewer: AgentDefinition = {
  description: "Expert code review specialist. Use for quality, security, and maintainability reviews.",
  prompt: `You are a code review specialist with expertise in security, performance, and best practices.

When reviewing code:
- Identify security vulnerabilities
- Check for performance issues
- Verify adherence to coding standards
- Suggest specific improvements

Be thorough but concise in your feedback.`,
  tools: ["Read", "Grep", "Glob"],
  model: "sonnet",
};
```

### Python

```python
from claude_agent_sdk import AgentDefinition

code_reviewer = AgentDefinition(
    description="Expert code review specialist. Use for quality, security, and maintainability reviews.",
    prompt="""You are a code review specialist with expertise in security, performance, and best practices.

When reviewing code:
- Identify security vulnerabilities
- Check for performance issues
- Verify adherence to coding standards
- Suggest specific improvements

Be thorough but concise in your feedback.""",
    tools=["Read", "Grep", "Glob"],
    model="sonnet",
)
```

---

## 4. Programmatic Subagents

Define subagents directly in code using the `agents` parameter. The `Agent` tool must be included in `allowedTools` since Claude invokes subagents through it.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Review the authentication module for security issues",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Agent"],
    agents: {
      "code-reviewer": {
        description: "Expert code review specialist. Use for quality, security, and maintainability reviews.",
        prompt: "You are a code review specialist...",
        tools: ["Read", "Grep", "Glob"],
        model: "sonnet",
      },
      "test-runner": {
        description: "Runs and analyzes test suites. Use for test execution and coverage analysis.",
        prompt: "You are a test execution specialist...",
        tools: ["Bash", "Read", "Grep"],
      },
    },
  }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}
```

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition

async def main():
    async for message in query(
        prompt="Review the authentication module for security issues",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Grep", "Glob", "Agent"],
            agents={
                "code-reviewer": AgentDefinition(
                    description="Expert code review specialist.",
                    prompt="You are a code review specialist...",
                    tools=["Read", "Grep", "Glob"],
                    model="sonnet",
                ),
                "test-runner": AgentDefinition(
                    description="Runs and analyzes test suites.",
                    prompt="You are a test execution specialist...",
                    tools=["Bash", "Read", "Grep"],
                ),
            },
        ),
    ):
        if hasattr(message, "result"):
            print(message.result)

asyncio.run(main())
```

---

## 5. Filesystem-Based Subagents

Define agents as markdown files in `.claude/agents/` directories. These are loaded at session startup.

```
.claude/agents/
  code-reviewer.md
  test-runner.md
```

```markdown
---
description: Expert code review specialist. Use for quality, security, and maintainability reviews.
tools: Read, Grep, Glob
model: sonnet
---

You are a code review specialist with expertise in security, performance, and best practices.

When reviewing code:
- Identify security vulnerabilities
- Check for performance issues
- Verify adherence to coding standards
- Suggest specific improvements
```

> Filesystem-based agents are loaded at startup only. Restart the session after creating new agent files.

---

## 6. Built-In General-Purpose Subagent

Claude can invoke the built-in general-purpose subagent at any time via the Agent tool without you defining anything. This is useful for:

- Ad-hoc subtask delegation
- File exploration (`Explore` subagent type)
- Planning (`Plan` subagent type)
- General research tasks

The built-in agent inherits the parent's available tools.

---

## 7. Inheritance

| The Subagent Receives | The Subagent Does NOT Receive |
|-----------------------|------------------------------|
| Its own system prompt (`AgentDefinition.prompt`) and the Agent tool's prompt | The parent's conversation history or tool results |
| Project CLAUDE.md (loaded via `settingSources`) | Skills (unless listed in `AgentDefinition.skills`, TypeScript only) |
| Tool definitions (inherited from parent, or the subset in `tools`) | The parent's system prompt |

**Result flow:** The parent receives the subagent's final message verbatim as the Agent tool result, but may summarize it in its own response.

---

## 8. Invocation Patterns

### Automatic Invocation

Claude automatically decides when to invoke subagents based on the task and each subagent's `description`. Write clear, specific descriptions so Claude can match tasks to the right subagent.

```typescript
// Good: specific and actionable
description: "Expert code review specialist. Use for quality, security, and maintainability reviews."

// Bad: vague
description: "A helpful agent"
```

### Explicit Invocation

To guarantee Claude uses a specific subagent, mention it by name in your prompt:

```typescript
for await (const message of query({
  prompt: "Use the code-reviewer agent to check the authentication module",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Agent"],
    agents: { "code-reviewer": codeReviewerDef }
  }
})) { /* handle */ }
```

### Detecting Subagent Invocation

Subagents are invoked via the Agent tool. Check for `tool_use` blocks where `name` is `"Agent"`. Messages from within a subagent's context include a `parent_tool_use_id` field.

> The tool name was renamed from "Task" to "Agent" in Claude Code v2.1.63. Check both values for backward compatibility.

---

## 9. Dynamic Agent Configuration

Create agent definitions dynamically based on runtime conditions:

```typescript
function createSecurityAgent(level: "strict" | "balanced"): AgentDefinition {
  return {
    description: "Security code reviewer",
    prompt: `You are a ${level} security reviewer. ${
      level === "strict"
        ? "Flag ALL potential vulnerabilities, even low-severity ones."
        : "Focus on high and critical severity vulnerabilities."
    }`,
    tools: ["Read", "Grep", "Glob"],
    model: level === "strict" ? "opus" : "sonnet",
  };
}

for await (const message of query({
  prompt: "Review this PR for security issues",
  options: {
    allowedTools: ["Read", "Grep", "Glob", "Agent"],
    agents: {
      "security-reviewer": createSecurityAgent("strict")
    }
  }
})) { /* handle */ }
```

```python
def create_security_agent(security_level: str) -> AgentDefinition:
    is_strict = security_level == "strict"
    return AgentDefinition(
        description="Security code reviewer",
        prompt=f"You are a {'strict' if is_strict else 'balanced'} security reviewer...",
        tools=["Read", "Grep", "Glob"],
        model="opus" if is_strict else "sonnet",
    )
```

---

## 10. Resuming Subagents

Subagents can be resumed to continue where they left off. Resumed subagents retain their full conversation history.

### Steps

1. Capture the session ID from messages during the first query
2. Extract the agent ID from the message content
3. Resume the session by passing `resume: sessionId` in the second query's options

```typescript
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

function extractAgentId(message: SDKMessage): string | undefined {
  if (!("message" in message)) return undefined;
  const content = JSON.stringify(message.message.content);
  const match = content.match(/agentId:\s*([a-f0-9-]+)/);
  return match?.[1];
}

let agentId: string | undefined;
let sessionId: string | undefined;

// First query: capture IDs
for await (const message of query({
  prompt: "Use the Explore agent to find all API endpoints in this codebase",
  options: { allowedTools: ["Read", "Grep", "Glob", "Agent"] }
})) {
  if ("session_id" in message) sessionId = message.session_id;
  const extractedId = extractAgentId(message);
  if (extractedId) agentId = extractedId;
  if ("result" in message) console.log(message.result);
}

// Second query: resume the agent
if (agentId && sessionId) {
  for await (const message of query({
    prompt: `Resume agent ${agentId} and list the top 3 most complex endpoints`,
    options: {
      allowedTools: ["Read", "Grep", "Glob", "Agent"],
      resume: sessionId
    }
  })) {
    if ("result" in message) console.log(message.result);
  }
}
```

---

## 11. Tool Restriction Patterns

Control what tools each subagent can access via the `tools` field:

- **Omit the field**: agent inherits all available tools (default)
- **Specify tools**: agent can only use listed tools

### Common Combinations

| Use Case | Tools | Description |
|----------|-------|-------------|
| Read-only analysis | `["Read", "Grep", "Glob"]` | Can examine code but not modify or execute |
| Test execution | `["Bash", "Read", "Grep"]` | Can run commands and analyze output |
| Code modification | `["Read", "Edit", "Write", "Grep", "Glob"]` | Full read/write without command execution |
| Full access | *(omit tools field)* | Inherits all tools from parent |
| Web research | `["WebSearch", "WebFetch", "Read"]` | Internet access for research |

> **Never include `"Agent"` in a subagent's tools array.** Subagents cannot spawn their own subagents.

---

## 12. Subagent Hooks

### SubagentStart

Fires when a subagent is initialized:

```typescript
hooks: {
  SubagentStart: [{
    hooks: [async (input, toolUseId, context) => {
      console.log(`Subagent starting: ${input.agent_id}`);
      return {};
    }]
  }]
}
```

### SubagentStop

Fires when a subagent completes:

```python
async def subagent_tracker(input_data, tool_use_id, context):
    print(f"[SUBAGENT] Completed: {input_data['agent_id']}")
    print(f"  Transcript: {input_data['agent_transcript_path']}")
    print(f"  Tool use ID: {tool_use_id}")
    print(f"  Stop hook active: {input_data.get('stop_hook_active')}")
    return {}

options = ClaudeAgentOptions(
    hooks={"SubagentStop": [HookMatcher(hooks=[subagent_tracker])]}
)
```

### Monitoring Parallel Subagents

When spawning multiple subagents, track them via their `agent_id` to aggregate results:

```typescript
const subagentResults = new Map<string, any>();

hooks: {
  SubagentStop: [{
    hooks: [async (input, toolUseId, context) => {
      subagentResults.set(input.agent_id, {
        transcript: input.agent_transcript_path,
        toolUseId,
      });
      console.log(`${subagentResults.size} subagents completed`);
      return {};
    }]
  }]
}
```

---

## 13. Gotchas and Constraints

### No Nested Subagents

Subagents cannot spawn their own subagents. The Agent tool is single-level only. Don't include `"Agent"` in a subagent's `tools` array.

### Permission Inheritance

Subagents do not automatically inherit parent agent permissions. Each subagent may request permissions separately. To avoid repeated prompts:
- Use `PreToolUse` hooks to auto-approve specific tools
- Configure permission rules that apply to subagent sessions

### Windows: Long Prompt Failures

On Windows, subagents with very long prompts may fail due to command line length limits (8191 chars). Keep prompts concise or use filesystem-based agents.

### Recursive Hook Loops

A `UserPromptSubmit` hook that spawns subagents can create infinite loops if those subagents trigger the same hook. Prevent this by:
- Checking for a subagent indicator in the hook input
- Using a shared variable to track whether you're inside a subagent
- Scoping hooks to only run for the top-level agent session

### Filesystem-Based Agent Loading

Agents in `.claude/agents/` are loaded at startup only. You must restart the session after creating new agent files.

### Subagent Context

- Subagents see the Agent tool's prompt (which includes the delegated task) but NOT the parent's full conversation history
- If a subagent needs specific context, include it in the task description passed to the Agent tool
- The parent gets only the subagent's final response, not intermediate tool calls

---

## Quick Reference

| Feature | TypeScript | Python |
|---------|-----------|--------|
| Define agents | `agents: { name: AgentDefinition }` | `agents={"name": AgentDefinition(...)}` |
| Enable Agent tool | `allowedTools: ["Agent"]` | `allowed_tools=["Agent"]` |
| Restrict tools | `tools: ["Read", "Grep"]` | `tools=["Read", "Grep"]` |
| Model override | `model: "sonnet"` | `model="sonnet"` |
| Filesystem agents | `.claude/agents/*.md` | `.claude/agents/*.md` |
| Track lifecycle | `SubagentStart` / `SubagentStop` hooks | `SubagentStart` / `SubagentStop` hooks |

---

*Next: [Deployment](./AGENT_SDK_DEPLOYMENT.md) · [Skills & Prompts](./AGENT_SDK_SKILLS_AND_PROMPTS.md) · [Overview](./AGENT_SDK_OVERVIEW.md)*
