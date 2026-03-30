# Agent SDK Skills and Prompts

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [System Prompt Configuration](#1-system-prompt-configuration)
2. [CLAUDE.md Files](#2-claudemd-files)
3. [Output Styles](#3-output-styles)
4. [systemPrompt with Append](#4-systemprompt-with-append)
5. [Custom System Prompts](#5-custom-system-prompts)
6. [Comparison of All Approaches](#6-comparison-of-all-approaches)
7. [settingSources Deep Dive](#7-settingsources-deep-dive)
8. [Skills Architecture](#8-skills-architecture)
9. [Using Skills with the SDK](#9-using-skills-with-the-sdk)
10. [Slash Commands](#10-slash-commands)
11. [Plugins](#11-plugins)
12. [Decision Guide](#12-decision-guide)

---

## 1. System Prompt Configuration

The system prompt defines Claude's behavior, capabilities, and response style. The Agent SDK provides four ways to customize it:

| Method | Persistence | Customization Level | Tools Preserved |
|--------|------------|-------------------|-----------------|
| CLAUDE.md files | Per-project file | Additions only | Yes |
| Output styles | Saved as files | Replace default | Yes |
| `systemPrompt` with append | Session only | Additions only | Yes |
| Custom `systemPrompt` | Session only | Complete control | No (must provide) |

**Default behavior:** The Agent SDK uses a minimal system prompt by default — only essential tool instructions. It omits Claude Code's coding guidelines, response style, and project context. To include the full Claude Code system prompt, specify the `claude_code` preset.

### What the Claude Code Preset Includes

- Tool usage instructions and available tools
- Code style and formatting guidelines
- Response tone and verbosity settings
- Security and safety instructions
- Context about the current working directory and environment

---

## 2. CLAUDE.md Files

CLAUDE.md files provide persistent, project-specific context and instructions that are automatically loaded at session start.

### Discovery and Loading

> **Critical:** The SDK only reads CLAUDE.md files when you explicitly configure `settingSources` (TS) / `setting_sources` (Python). The `claude_code` system prompt preset does NOT automatically load CLAUDE.md — you must also specify setting sources.

| Level | Location | When Loaded |
|-------|----------|-------------|
| Project (root) | `<cwd>/CLAUDE.md` or `<cwd>/.claude/CLAUDE.md` | settingSources includes `"project"` |
| Project rules | `<cwd>/.claude/rules/*.md` | settingSources includes `"project"` |
| Project (parent dirs) | CLAUDE.md files in directories above cwd | settingSources includes `"project"` |
| Project (child dirs) | CLAUDE.md files in subdirectories of cwd | settingSources includes `"project"`, loaded on demand |
| Local (gitignored) | `<cwd>/CLAUDE.local.md` | settingSources includes `"local"` |
| User | `~/.claude/CLAUDE.md` | settingSources includes `"user"` |
| User rules | `~/.claude/rules/*.md` | settingSources includes `"user"` |

### Example CLAUDE.md

```markdown
# Project Guidelines

## Code Style
- Use TypeScript strict mode
- Prefer functional components in React
- Always include JSDoc comments for public APIs

## Testing
- Run `npm test` before committing
- Maintain >80% code coverage
- Use jest for unit tests, playwright for E2E

## Commands
- Build: `npm run build`
- Dev server: `npm run dev`
- Type check: `npm run typecheck`
```

### Using CLAUDE.md with the SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Add a new React component for user profiles",
  options: {
    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["project"]  // Required to load CLAUDE.md
  }
})) {
  // CLAUDE.md instructions are now in context
}
```

```python
async for message in query(
    prompt="Add a new React component for user profiles",
    options=ClaudeAgentOptions(
        system_prompt={"type": "preset", "preset": "claude_code"},
        setting_sources=["project"],
    ),
):
    pass
```

---

## 3. Output Styles

Output styles are saved configurations stored as markdown files that modify Claude's response behavior. They persist across sessions and can be reused across projects.

### Creating an Output Style

Output styles are markdown files with YAML frontmatter stored in `~/.claude/output-styles/`:

```typescript
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

async function createOutputStyle(name: string, description: string, prompt: string) {
  const dir = join(homedir(), ".claude", "output-styles");
  await mkdir(dir, { recursive: true });

  const content = `---
name: ${name}
description: ${description}
---
${prompt}`;

  await writeFile(join(dir, `${name.toLowerCase().replace(/\s+/g, "-")}.md`), content, "utf-8");
}

await createOutputStyle(
  "Code Reviewer",
  "Thorough code review assistant",
  `You are an expert code reviewer.

For every code submission:
1. Check for bugs and security issues
2. Evaluate performance
3. Suggest improvements
4. Rate code quality (1-10)`
);
```

### Activating Output Styles

- **CLI**: `/output-style [style-name]`
- **Settings**: `.claude/settings.local.json`
- **Loading requirement**: Output styles are loaded when `settingSources` includes `'user'` or `'project'`

---

## 4. systemPrompt with Append

Use the `claude_code` preset with `append` to add custom instructions while preserving all built-in functionality:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Help me write a function to calculate fibonacci numbers",
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: "Always include detailed docstrings and type hints in Python code."
    }
  }
})) {
  if (message.type === "assistant") {
    console.log(message.message.content);
  }
}
```

```python
async for message in query(
    prompt="Help me write a function to calculate fibonacci numbers",
    options=ClaudeAgentOptions(
        system_prompt={
            "type": "preset",
            "preset": "claude_code",
            "append": "Always include detailed docstrings and type hints.",
        },
    ),
):
    pass
```

### When to Use Append

- Adding specific coding standards
- Customizing output formatting
- Adding domain-specific knowledge
- Enhancing Claude Code's default behavior without losing tool instructions

---

## 5. Custom System Prompts

Provide a custom string as `systemPrompt` to replace the default entirely:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const customPrompt = `You are a Python coding specialist.

Follow these guidelines:
- Write clean, well-documented code
- Use type hints for all functions
- Include comprehensive docstrings
- Prefer functional programming patterns when appropriate
- Always explain your code choices`;

for await (const message of query({
  prompt: "Create a data processing pipeline",
  options: { systemPrompt: customPrompt }
})) {
  if (message.type === "assistant") {
    console.log(message.message.content);
  }
}
```

> **Warning:** Custom system prompts replace the default entirely. You lose:
> - Tool usage instructions (tools still work, but Claude lacks guidance on best practices)
> - Code style and formatting guidelines
> - Security and safety instructions
> - Environment context (working directory, OS, shell)

### Combining Approaches

Use CLAUDE.md for project context + `systemPrompt` append for session-specific instructions:

```typescript
for await (const message of query({
  prompt: "Review this authentication module",
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `
For this review, prioritize:
- OAuth 2.0 compliance
- Token storage security
- Session management`
    },
    settingSources: ["project"]  // Also loads CLAUDE.md
  }
})) {
  // Has Claude Code defaults + project CLAUDE.md + session-specific focus
}
```

---

## 6. Comparison of All Approaches

| Feature | CLAUDE.md | Output Styles | Append | Custom |
|---------|-----------|--------------|--------|--------|
| **Persistence** | Per-project file | Saved as files | Session only | Session only |
| **Reusability** | Per-project | Across projects | Code duplication | Code duplication |
| **Management** | On filesystem | CLI + files | In code | In code |
| **Default tools preserved** | Yes | Yes | Yes | No (unless included) |
| **Built-in safety** | Maintained | Maintained | Maintained | Must be added |
| **Environment context** | Automatic | Automatic | Automatic | Must be provided |
| **Customization level** | Additions only | Replace default | Additions only | Complete control |
| **Version control** | With project | Yes | With code | With code |
| **Scope** | Project-specific | User or project | Code session | Code session |

---

## 7. settingSources Deep Dive

`settingSources` (TypeScript) / `setting_sources` (Python) controls which filesystem-based settings the SDK loads. By default, the SDK loads **nothing** from the filesystem.

| Source | What It Loads | Location |
|--------|-------------|----------|
| `"project"` | Project CLAUDE.md, `.claude/rules/*.md`, project skills, project hooks, project settings.json | `<cwd>/.claude/` and parent directories |
| `"user"` | User CLAUDE.md, `~/.claude/rules/*.md`, user skills, user settings | `~/.claude/` |
| `"local"` | `CLAUDE.local.md` (gitignored), `.claude/settings.local.json` | `<cwd>/` |

### Full Claude Code CLI Behavior

To match the full Claude Code CLI behavior, use all three:

```typescript
options: {
  settingSources: ["user", "project", "local"]
}
```

### What Each Source Enables

```typescript
// Minimal: only project CLAUDE.md and skills
settingSources: ["project"]

// Add user-level config (personal skills, output styles, global CLAUDE.md)
settingSources: ["user", "project"]

// Full CLI parity (includes gitignored local overrides)
settingSources: ["user", "project", "local"]
```

---

## 8. Skills Architecture

Skills are specialized capabilities that Claude autonomously invokes when relevant. They're packaged as SKILL.md files with progressive disclosure — metadata is discovered at startup, full content loaded only when triggered.

### How Skills Work

1. **Defined as filesystem artifacts**: Created as SKILL.md files in `.claude/skills/`
2. **Loaded from filesystem**: Requires `settingSources` to be configured
3. **Automatically discovered**: Skill metadata discovered at startup from user and project directories
4. **Model-invoked**: Claude autonomously chooses when to use them based on context
5. **Enabled via allowedTools**: Add `"Skill"` to your allowed tools

> Unlike subagents (which can be defined programmatically), Skills must be created as filesystem artifacts. The SDK does not provide a programmatic API for registering Skills.

### SKILL.md Format

Skills are directories containing a SKILL.md file with YAML frontmatter:

```
.claude/skills/processing-pdfs/
  SKILL.md
```

```markdown
---
name: PDF Processor
description: Extract text, tables, and metadata from PDF documents.
  Use when the user asks to analyze, parse, or extract data from PDFs.
allowed-tools: Read, Bash, Write
---

You are a PDF processing specialist.

When processing a PDF:
1. Use pdftotext or similar CLI tools via Bash to extract text
2. Parse tables using tabula-py or similar
3. Return structured output with extracted content
4. Handle multi-page documents efficiently
```

> The `allowed-tools` frontmatter field in SKILL.md is only supported when using Claude Code CLI directly. It does not apply through the SDK — use `allowedTools` in SDK options instead.

### Skill Locations

| Location | Scope | Setting Source |
|----------|-------|---------------|
| `.claude/skills/` | Project (shared via git) | `"project"` |
| `~/.claude/skills/` | User (personal, all projects) | `"user"` |
| Plugin skills | Bundled with installed plugins | Via `plugins` option |

---

## 9. Using Skills with the SDK

### Basic Setup

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Help me process this PDF document",
  options: {
    settingSources: ["user", "project"],  // Required to load skills
    allowedTools: ["Skill", "Read", "Write", "Bash"],  // "Skill" enables skill invocation
  }
})) {
  // Claude will autonomously invoke relevant skills
}
```

```python
options = ClaudeAgentOptions(
    cwd="/path/to/project",
    setting_sources=["user", "project"],
    allowed_tools=["Skill", "Read", "Write", "Bash"],
)

async for message in query(prompt="Help me process this PDF document", options=options):
    print(message)
```

### Discovering Available Skills

```python
options = ClaudeAgentOptions(
    setting_sources=["user", "project"],
    allowed_tools=["Skill"],
)

async for message in query(prompt="What Skills are available?", options=options):
    print(message)
```

### Troubleshooting Skills

| Issue | Cause | Fix |
|-------|-------|-----|
| Skills not found | `settingSources` not configured | Add `settingSources: ["user", "project"]` |
| Skills not found | Wrong working directory | Set `cwd` to directory containing `.claude/skills/` |
| Skill not being used | `"Skill"` not in allowedTools | Add `"Skill"` to `allowedTools` |
| Skill not being used | Poor description | Make description specific with relevant keywords |

---

## 10. Slash Commands

Slash commands are user-invoked commands defined as markdown files. They can be sent through the SDK as prompts.

### Built-In Commands

| Command | Purpose |
|---------|---------|
| `/compact` | Compact conversation history (summarize older messages) |
| `/clear` | Start a fresh conversation |
| `/help` | Get help information |

### Sending Slash Commands

```typescript
for await (const message of query({
  prompt: "/compact",
  options: { maxTurns: 1 }
})) {
  if (message.type === "system" && message.subtype === "compact_boundary") {
    console.log("Compaction completed");
    console.log("Pre-compaction tokens:", message.compact_metadata.pre_tokens);
  }
}
```

### Custom Slash Commands

Create markdown files in `.claude/commands/` (legacy) or `.claude/skills/` (recommended):

**File locations:**
- **Project commands**: `.claude/commands/` — available in current project
- **Personal commands**: `~/.claude/commands/` — available across all projects

**Format:**

```markdown
---
allowed-tools: Read, Grep, Glob
description: Run security vulnerability scan
model: claude-opus-4-6
---

Analyze the codebase for security vulnerabilities including:
- SQL injection risks
- XSS vulnerabilities
- Exposed credentials
- Insecure configurations
```

### Frontmatter Options

| Field | Purpose | Example |
|-------|---------|---------|
| `allowed-tools` | Restrict tools for this command | `Read, Grep, Glob` |
| `description` | Human-readable description | `"Run security scan"` |
| `model` | Model override | `claude-opus-4-6` |
| `argument-hint` | Placeholder for arguments | `[issue-number] [priority]` |

### Arguments and Placeholders

```markdown
---
argument-hint: [issue-number] [priority]
description: Fix a GitHub issue
---

Fix issue #$1 with priority $2.
Check the issue description and implement the necessary changes.
```

```typescript
for await (const message of query({
  prompt: "/fix-issue 123 high",
  options: { maxTurns: 5 }
})) {
  // $1 = "123", $2 = "high"
}
```

### Dynamic Content in Commands

**Bash command output** (prefixed with `!`):

```markdown
## Context
- Current status: !`git status`
- Current diff: !`git diff HEAD`

## Task
Create a git commit with appropriate message based on the changes.
```

**File references** (prefixed with `@`):

```markdown
Review the following configuration files for issues:
- Package config: @package.json
- TypeScript config: @tsconfig.json
```

### Namespacing

Organize commands in subdirectories:

```
.claude/commands/
  frontend/
    component.md    →  /frontend/component
    style-check.md  →  /frontend/style-check
  backend/
    api-test.md     →  /backend/api-test
    db-migrate.md   →  /backend/db-migrate
  review.md         →  /review
```

---

## 11. Plugins

Plugins are packages of Claude Code extensions that can include skills, agents, hooks, and MCP servers.

### Plugin Structure

```
my-plugin/
  .claude-plugin/
    plugin.json          # Required: plugin manifest
  skills/                # Agent Skills
    my-skill/
      SKILL.md
  commands/              # Legacy: use skills/ instead
    custom-cmd.md
  agents/                # Custom agents
    specialist.md
  hooks/                 # Event handlers
    hooks.json
  .mcp.json              # MCP server definitions
```

### Loading Plugins

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Hello",
  options: {
    plugins: [
      { type: "local", path: "./my-plugin" },
      { type: "local", path: "/absolute/path/to/another-plugin" }
    ]
  }
})) {
  // Plugin commands, agents, skills, and hooks are now available
}
```

### Namespaced Skills

Plugin skills are automatically namespaced: `plugin-name:skill-name`

```typescript
for await (const message of query({
  prompt: "/my-plugin:greet",
  options: {
    plugins: [{ type: "local", path: "./my-plugin" }]
  }
})) {
  // Invokes the "greet" skill from "my-plugin"
}
```

### Verifying Plugin Installation

```typescript
for await (const message of query({
  prompt: "Hello",
  options: { plugins: [{ type: "local", path: "./my-plugin" }] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    console.log("Plugins:", message.plugins);
    console.log("Commands:", message.slash_commands);
  }
}
```

---

## 12. Decision Guide

| You Want To... | Use | SDK Surface |
|----------------|-----|-------------|
| Set project conventions | CLAUDE.md | `settingSources: ["project"]` |
| Give reference material loaded when relevant | Skills | `settingSources` + `allowedTools: ["Skill"]` |
| Run reusable workflows | User-invocable skills | `settingSources` + `allowedTools: ["Skill"]` |
| Delegate isolated subtasks | Subagents | `agents` parameter + `allowedTools: ["Agent"]` |
| Run deterministic logic on tool calls | Hooks | `hooks` parameter with callbacks |
| Give Claude structured tool access to external services | MCP | `mcpServers` parameter |
| Modify response style across sessions | Output styles | `settingSources: ["user"]` |
| Add session-specific instructions | `systemPrompt` append | `systemPrompt: { preset: "claude_code", append: "..." }` |
| Replace the entire prompt | Custom `systemPrompt` | `systemPrompt: "your prompt"` |
| Bundle multiple extensions | Plugins | `plugins: [{ type: "local", path: "..." }]` |

---

*Next: [Subagents](./AGENT_SDK_SUBAGENTS.md) · [Tools](./AGENT_SDK_TOOLS.md) · [Overview](./AGENT_SDK_OVERVIEW.md)*
