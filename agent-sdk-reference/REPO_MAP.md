# Agent SDK Reference — Repo Map

> Canonical reference for building AI agents in chat-engine-x-api-v2
> Last updated: 2026-03-30
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Purpose

This directory contains 8 synthesized reference files covering the Claude Agent SDK. These are the single source of truth for building and deploying AI agents in this codebase — the equivalent of `ENGINE_X_TRIGGER_PATTERNS.md` for Trigger.dev.

**Primary language**: TypeScript (matching the Hono/Node.js stack of chat-engine-x-api-v2). Python examples are included alongside TypeScript for SDK-generic files (1-7). `AGENT_SDK_PATTERNS.md` is TypeScript-only as it maps directly to this codebase.

---

## Recommended Reading Order

1. **OVERVIEW** — Start here. Understand what the SDK is, how the agent loop works, and available models.
2. **TOOLS** — How the agent interacts with the world: built-in tools, custom tools, MCP, permissions.
3. **SESSIONS** — Conversation persistence: continue, resume, fork, checkpointing, compaction.
4. **STREAMING** — Input modes and real-time output streaming.
5. **SKILLS_AND_PROMPTS** — System prompt configuration, skills, slash commands, plugins.
6. **SUBAGENTS** — Spawning, configuring, and managing child agents.
7. **DEPLOYMENT** — Hosting, security, hooks, cost tracking, budget controls.
8. **PATTERNS** — How it all maps to chat-engine-x-api-v2 specifically.

---

## File Index

| # | File | Purpose | Language | Words | Lines |
|---|------|---------|----------|-------|-------|
| 1 | [AGENT_SDK_OVERVIEW.md](./AGENT_SDK_OVERVIEW.md) | SDK fundamentals: agent loop, models, effort levels, migration, options reference | TS + Python | 2,653 | 556 |
| 2 | [AGENT_SDK_TOOLS.md](./AGENT_SDK_TOOLS.md) | Built-in tools, custom tools, MCP servers, tool search, permissions, structured output | TS + Python | 2,348 | 545 |
| 3 | [AGENT_SDK_SESSIONS.md](./AGENT_SDK_SESSIONS.md) | Session management: continue/resume/fork, V2 preview API, file checkpointing, compaction | TS + Python | 2,505 | 633 |
| 4 | [AGENT_SDK_STREAMING.md](./AGENT_SDK_STREAMING.md) | Input modes, output streaming, StreamEvent reference, SSE integration | TS + Python | 2,052 | 562 |
| 5 | [AGENT_SDK_SKILLS_AND_PROMPTS.md](./AGENT_SDK_SKILLS_AND_PROMPTS.md) | System prompts, CLAUDE.md, output styles, skills, slash commands, plugins | TS + Python | 2,553 | 629 |
| 6 | [AGENT_SDK_SUBAGENTS.md](./AGENT_SDK_SUBAGENTS.md) | Subagent creation, AgentDefinition, inheritance, tool restrictions, hooks | TS + Python | 2,043 | 478 |
| 7 | [AGENT_SDK_DEPLOYMENT.md](./AGENT_SDK_DEPLOYMENT.md) | Hosting, isolation, security, permission modes, hooks system, cost tracking, todos | TS + Python | 3,231 | 726 |
| 8 | [AGENT_SDK_PATTERNS.md](./AGENT_SDK_PATTERNS.md) | chat-engine-x-api-v2 specific: platform routing, provider rules, auth, streaming, migration | TS only | 3,673 | 952 |

**Total: ~21,058 words across 5,081 lines**

---

## Source Attribution

These files are synthesized from 29 source documents in `api-reference-docs-new/anthropic/home/08-agent-sdk/` plus supplementary documentation on Agent Skills, MCP Connector, Models/Pricing, and Extended Thinking. Source material was read-only — no files in `api-reference-docs-new/` were modified.

Codebase-specific patterns in `AGENT_SDK_PATTERNS.md` are derived from:
- `src/config.ts` — service URLs, model selection, auth config
- `src/index.ts` — Hono app, middleware chain
- `src/middleware/auth.ts` — EdDSA JWT, JWKS, AuthContext
- `src/flows/loader.ts` — FlowConfig, YAML frontmatter parsing
- `src/flows/*.md` — platform flow definitions
- `src/provider-rules/resolver.ts` — three-tier resolution
- `docs/PRD.md` — capability module system, request flow

---

## SDK Version Info

| Component | Version | Notes |
|-----------|---------|-------|
| TypeScript SDK | `@anthropic-ai/claude-agent-sdk` v0.2.86 | npm package |
| Python SDK | `claude-agent-sdk` | PyPI package |
| Claude Code CLI | `@anthropic-ai/claude-code` | Required runtime dependency |
| Opus 4.6 | `claude-opus-4-6` | $5/$25 per MTok, 1M context |
| Sonnet 4.6 | `claude-sonnet-4-6` | $3/$15 per MTok, 1M context |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | $1/$5 per MTok, 200k context |

> The V2 TypeScript API (`unstable_v2_*`) is an unstable preview. Session forking is V1-only.
> The tool was renamed from "Task" to "Agent" in Claude Code v2.1.63.
> The package was renamed from `@anthropic-ai/claude-code-sdk` to `@anthropic-ai/claude-agent-sdk`.
