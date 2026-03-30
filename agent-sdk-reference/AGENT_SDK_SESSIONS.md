# Agent SDK Sessions

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [What a Session Is](#1-what-a-session-is)
2. [Choose an Approach](#2-choose-an-approach)
3. [Continue vs Resume vs Fork](#3-continue-vs-resume-vs-fork)
4. [Automatic Session Management](#4-automatic-session-management)
5. [Session ID Capture and Resume](#5-session-id-capture-and-resume)
6. [Forking Sessions](#6-forking-sessions)
7. [V2 Preview Session API](#7-v2-preview-session-api)
8. [File Checkpointing](#8-file-checkpointing)
9. [Context Compaction](#9-context-compaction)
10. [Cross-Host Portability](#10-cross-host-portability)
11. [Stateless Sessions](#11-stateless-sessions)

---

## 1. What a Session Is

A session is the conversation history the SDK accumulates while your agent works. It contains:

- Your prompt
- Every tool call the agent made
- Every tool result
- Every response

The SDK writes it to disk automatically so you can return to it later. Returning to a session means the agent has full context from before — files it already read, analysis it already performed, decisions it already made.

**Key distinction:** Sessions persist the *conversation*, not the *filesystem*. To snapshot and revert file changes, use [file checkpointing](#8-file-checkpointing).

### Scoping

| Scope | Definition |
|-------|-----------|
| **query() call** | One invocation of `query()`. Can involve multiple steps. Produces one result message. |
| **Step** | A single request/response cycle within a `query()` call. |
| **Session** | A series of `query()` calls linked by a session ID (via `resume`). Each `query()` reports its own cost independently. |

---

## 2. Choose an Approach

| What You're Building | What to Use |
|---------------------|-------------|
| One-shot task: single prompt, no follow-up | Nothing extra. One `query()` call handles it. |
| Multi-turn chat in one process | `ClaudeSDKClient` (Python) or `continue: true` (TypeScript) |
| Pick up where you left off after a process restart | `continue_conversation=True` (Python) / `continue: true` (TypeScript) |
| Resume a specific past session | Capture the session ID and pass it to `resume` |
| Try an alternative approach without losing the original | Fork the session |
| Stateless task, don't want anything written to disk (TS only) | Set `persistSession: false` |

---

## 3. Continue vs Resume vs Fork

| Mode | How It Works | When to Use |
|------|-------------|------------|
| **Continue** | Finds the most recent session in the current directory. No ID tracking needed. | Simple sequential workflows in a single directory |
| **Resume** | Takes a specific session ID. Required when you have multiple sessions. | Multi-tenant apps, parallel sessions, specific session recall |
| **Fork** | Creates a new session that starts with a copy of the original's history. The original stays unchanged. | Exploring alternative approaches, A/B testing agent strategies |

---

## 4. Automatic Session Management

### TypeScript: `continue: true`

Pass `continue: true` on each subsequent `query()` call to resume the most recent session:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// First query: creates a new session
for await (const message of query({
  prompt: "Analyze the auth module",
  options: { allowedTools: ["Read", "Glob", "Grep"] }
})) { /* handle messages */ }

// Second query: continue: true resumes the most recent session
for await (const message of query({
  prompt: "Now refactor it to use JWT",
  options: { continue: true, allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"] }
})) { /* handle messages */ }
```

### Python: ClaudeSDKClient

`ClaudeSDKClient` handles session IDs internally. Each call to `client.query()` automatically continues the same session:

```python
import asyncio
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, ResultMessage, TextBlock

async def main():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Edit", "Glob", "Grep"],
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query("Analyze the auth module")
        async for message in client.receive_response():
            print_response(message)

        await client.query("Now refactor it to use JWT")
        async for message in client.receive_response():
            print_response(message)

asyncio.run(main())
```

---

## 5. Session ID Capture and Resume

### Capture the Session ID

The session ID is available on the `ResultMessage`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let sessionId: string | undefined;

for await (const message of query({
  prompt: "Analyze the auth module and suggest improvements",
  options: { allowedTools: ["Read", "Glob", "Grep"] }
})) {
  if (message.type === "result") {
    sessionId = message.session_id;
    console.log(`Session ID: ${sessionId}`);
  }
}
```

```python
async for message in query(
    prompt="Analyze the auth module and suggest improvements",
    options=ClaudeAgentOptions(allowed_tools=["Read", "Glob", "Grep"]),
):
    if isinstance(message, ResultMessage):
        session_id = message.session_id
        print(f"Session ID: {session_id}")
```

### Resume by ID

```typescript
for await (const message of query({
  prompt: "Now implement the refactoring you suggested",
  options: {
    resume: sessionId,
    allowedTools: ["Read", "Edit", "Write", "Glob", "Grep"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

```python
async for message in query(
    prompt="Now implement the refactoring you suggested",
    options=ClaudeAgentOptions(
        resume=session_id,
        allowed_tools=["Read", "Edit", "Write", "Glob", "Grep"],
    ),
):
    if isinstance(message, ResultMessage) and message.subtype == "success":
        print(message.result)
```

---

## 6. Forking Sessions

Forking creates a new session that starts with a copy of the original's history but diverges from that point. The original stays unchanged.

```typescript
for await (const message of query({
  prompt: "Instead of JWT, implement OAuth2 for the auth module",
  options: {
    resume: sessionId,
    forkSession: true
  }
})) {
  if (message.type === "result") {
    const forkedId = message.session_id;
    console.log(`Forked session: ${forkedId}`);
  }
}
```

```python
async for message in query(
    prompt="Instead of JWT, implement OAuth2 for the auth module",
    options=ClaudeAgentOptions(
        resume=session_id,
        fork_session=True,
    ),
):
    if isinstance(message, ResultMessage):
        forked_id = message.session_id
```

### When to Fork

- **A/B testing agent approaches**: Try two different solutions from the same analysis point
- **Rollback safety**: Keep a known-good session while exploring risky changes
- **User branching**: Let users explore "what if" scenarios without losing their place

---

## 7. V2 Preview Session API

> **Unstable preview.** APIs may change before becoming stable. Session forking is only available in V1.

The V2 interface simplifies multi-turn conversations by removing async generators. The API reduces to three concepts:

| Concept | Purpose |
|---------|---------|
| `createSession()` / `resumeSession()` | Start or continue a conversation |
| `session.send()` | Send a message |
| `session.stream()` | Get the response |

### One-Shot Prompt

```typescript
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

const result = await unstable_v2_prompt("What is 2 + 2?", {
  model: "claude-opus-4-6"
});

if (result.subtype === "success") {
  console.log(result.result);
}
```

### Multi-Turn Session

```typescript
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

await using session = unstable_v2_createSession({
  model: "claude-opus-4-6"
});

// Turn 1
await session.send("What is 5 + 3?");
for await (const msg of session.stream()) {
  if (msg.type === "assistant") {
    const text = msg.message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    console.log(text);
  }
}

// Turn 2
await session.send("Multiply that by 2");
for await (const msg of session.stream()) {
  if (msg.type === "assistant") {
    const text = msg.message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    console.log(text);
  }
}
```

### Session Resume (V2)

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from "@anthropic-ai/claude-agent-sdk";

// Create and use initial session
const session = unstable_v2_createSession({ model: "claude-opus-4-6" });
await session.send("Remember this number: 42");
let sessionId: string | undefined;
for await (const msg of session.stream()) {
  sessionId = msg.session_id;
}
session.close();

// Later: resume the session
await using resumedSession = unstable_v2_resumeSession(sessionId!, {
  model: "claude-opus-4-6"
});
await resumedSession.send("What number did I ask you to remember?");
for await (const msg of resumedSession.stream()) {
  // Agent has full context from original session
}
```

### SDKSession Interface

```typescript
interface SDKSession {
  readonly sessionId: string;
  send(message: string | SDKUserMessage): Promise<void>;
  stream(): AsyncGenerator<SDKMessage, void>;
  close(): void;
}
```

### Cleanup

Sessions can be cleaned up manually or automatically with `await using` (TypeScript 5.2+):

```typescript
// Automatic cleanup (TypeScript 5.2+)
await using session = unstable_v2_createSession({ model: "claude-opus-4-6" });
// Session closes automatically when the block exits

// Manual cleanup
const session = unstable_v2_createSession({ model: "claude-opus-4-6" });
// ... use the session ...
session.close();
```

### V2 Feature Gaps

Not all V1 features are available in V2 yet:

- Session forking (`forkSession` option) — V1 only
- Some advanced streaming input patterns — V1 only

---

## 8. File Checkpointing

File checkpointing tracks file modifications made through the Write, Edit, and NotebookEdit tools, allowing you to rewind files to any previous state.

### What Is Tracked

| Tracked | Not Tracked |
|---------|------------|
| Files created via Write, Edit, NotebookEdit | Changes via Bash commands (`echo > file.txt`, `sed -i`) |
| Files modified via those tools | Directory creation/deletion |
| Original content of modified files | Remote or network files |

### How It Works

1. **Enable checkpointing** in options
2. **Capture checkpoint UUIDs** from user messages in the response stream
3. **Call `rewindFiles()`** to restore files to a checkpoint state

When you rewind to a checkpoint, created files are deleted and modified files are restored to their content at that point. The conversation history remains intact.

### Implementation

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let checkpointId: string | undefined;
let sessionId: string | undefined;

// Step 1: Enable checkpointing and capture UUIDs
for await (const message of query({
  prompt: "Refactor the authentication module",
  options: {
    enableFileCheckpointing: true,
    permissionMode: "acceptEdits",
    extraArgs: { 'replay-user-messages': null }  // Required for checkpoint UUIDs
  }
})) {
  // Step 2: Capture first user message UUID as checkpoint
  if (message.type === "user" && message.uuid && !checkpointId) {
    checkpointId = message.uuid;
  }
  if (message.type === "result") {
    sessionId = message.session_id;
  }
}

// Step 3: Rewind files by resuming with empty prompt
if (checkpointId && sessionId) {
  for await (const message of query({
    prompt: "",
    options: {
      enableFileCheckpointing: true,
      resume: sessionId
    }
  })) {
    // Call rewindFiles on the session
    break;
  }
}
```

```python
import asyncio
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, UserMessage, ResultMessage

async def main():
    options = ClaudeAgentOptions(
        enable_file_checkpointing=True,
        permission_mode="acceptEdits",
        extra_args={"replay-user-messages": None},  # Required for checkpoint UUIDs
    )

    checkpoint_id = None
    session_id = None

    async with ClaudeSDKClient(options) as client:
        await client.query("Refactor the authentication module")
        async for message in client.receive_response():
            if isinstance(message, UserMessage) and message.uuid and not checkpoint_id:
                checkpoint_id = message.uuid
            if isinstance(message, ResultMessage) and not session_id:
                session_id = message.session_id

    # Rewind: resume with empty prompt, then call rewind_files()
    if checkpoint_id and session_id:
        async with ClaudeSDKClient(
            ClaudeAgentOptions(enable_file_checkpointing=True, resume=session_id)
        ) as client:
            await client.query("")
            async for message in client.receive_response():
                await client.rewind_files(checkpoint_id)
                break
        print(f"Rewound to checkpoint: {checkpoint_id}")

asyncio.run(main())
```

### CLI Rewind

```bash
claude --resume <session-id> --rewind-files <checkpoint-uuid>
```

### Common Patterns

#### Checkpoint Before Risky Operations

Keep only the most recent checkpoint UUID, updating before each turn:

```python
safe_checkpoint = None

async with ClaudeSDKClient(options) as client:
    await client.query("Refactor the authentication module")
    async for message in client.receive_response():
        if isinstance(message, UserMessage) and message.uuid:
            safe_checkpoint = message.uuid

        if your_revert_condition and safe_checkpoint:
            await client.rewind_files(safe_checkpoint)
            break
```

#### Multiple Restore Points

Store all checkpoint UUIDs with metadata for granular rollback:

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class Checkpoint:
    id: str
    description: str
    timestamp: datetime

checkpoints: list[Checkpoint] = []

# During query, accumulate checkpoints:
if isinstance(message, UserMessage) and message.uuid:
    checkpoints.append(Checkpoint(
        id=message.uuid,
        description=f"After turn {len(checkpoints) + 1}",
        timestamp=datetime.now(),
    ))

# Later: rewind to any checkpoint
target = checkpoints[0]  # or pick by description/timestamp
await client.rewind_files(target.id)
```

### Limitations

| Limitation | Description |
|-----------|------------|
| Write/Edit/NotebookEdit tools only | Changes made through Bash commands are not tracked |
| Same session | Checkpoints are tied to the session that created them |
| File content only | Creating, moving, or deleting directories is not undone |
| Local files | Remote or network files are not tracked |

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| User messages don't have UUIDs | `replay-user-messages` not set | Add `extraArgs: { 'replay-user-messages': null }` |
| "No file checkpoint found" error | Checkpointing not enabled on original session | Ensure `enableFileCheckpointing: true` was set |
| "ProcessTransport is not ready" error | Called `rewindFiles()` after stream finished | Resume session with empty prompt first, then call rewind |

---

## 9. Context Compaction

When a conversation approaches the model's context window limit, the SDK automatically compacts the history by summarizing older messages while preserving important context.

### How Compaction Works

1. The SDK monitors context window usage during the agent loop
2. When approaching the limit, it triggers compaction automatically
3. Older messages are summarized; recent messages and tool results are preserved
4. A `CompactBoundaryMessage` is emitted in the stream

### Manual Compaction

You can trigger compaction via the `/compact` slash command:

```typescript
for await (const message of query({
  prompt: "/compact",
  options: { maxTurns: 1 }
})) {
  if (message.type === "system" && message.subtype === "compact_boundary") {
    console.log("Pre-compaction tokens:", message.compact_metadata.pre_tokens);
    console.log("Trigger:", message.compact_metadata.trigger);
  }
}
```

### PreCompact Hook

Use the `PreCompact` hook to archive the full transcript before summarization:

```typescript
const hooks = {
  PreCompact: [{
    hooks: [async (input, toolUseId, context) => {
      // Archive the full conversation before compaction
      await archiveTranscript(input.session_id);
      return {};
    }]
  }]
};
```

### Impact on Sessions

- Compaction is transparent to session resume — the compacted history is what gets persisted
- The summarized context is sufficient for most follow-up tasks
- For tasks requiring full history, archive via `PreCompact` hook before compaction occurs

---

## 10. Cross-Host Portability

Session files are local to the machine that created them. To resume on a different host:

**Option 1: Transfer the session file**
Move the session file and restore it to the same path on the new host.

**Option 2: Capture and re-inject**
Capture results as application state and pass them into a fresh session's prompt on the new host.

**Option 3: External persistence (recommended for production)**
Store session metadata (ID, summary, key decisions) in a database. On resume, create a fresh session with a prompt that includes the stored context:

```typescript
// Pseudo-code for external session persistence
const storedContext = await db.getSessionContext(threadId);

for await (const message of query({
  prompt: `Continue from this context: ${storedContext.summary}\n\nNew task: ${userMessage}`,
  options: { allowedTools: ["Read", "Edit", "Write"] }
})) {
  // Handle messages
}
```

---

## 11. Stateless Sessions

TypeScript supports fully stateless sessions that write nothing to disk:

```typescript
for await (const message of query({
  prompt: "Quick analysis task",
  options: {
    persistSession: false,  // Nothing written to disk
    maxTurns: 3
  }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}
```

Use `persistSession: false` for:
- Lambda/serverless functions
- Stateless API endpoints
- Tasks that don't need follow-up
- Environments where disk writes are restricted

> **Python note**: `persistSession` is TypeScript-only. In Python, sessions always persist to disk.

---

## Quick Reference

| Option | TypeScript | Python | Purpose |
|--------|-----------|--------|---------|
| Continue most recent | `continue: true` | `ClaudeSDKClient` (automatic) | Multi-turn in one process |
| Resume specific session | `resume: sessionId` | `resume=session_id` | Cross-process continuation |
| Fork session | `forkSession: true` + `resume` | `fork_session=True` + `resume` | Branch from existing session |
| Enable checkpoints | `enableFileCheckpointing: true` | `enable_file_checkpointing=True` | Track file changes |
| Get checkpoint UUIDs | `extraArgs: { 'replay-user-messages': null }` | `extra_args={"replay-user-messages": None}` | Required for rewind |
| Rewind files | `rewindFiles(uuid)` | `rewind_files(uuid)` | Restore to checkpoint |
| No disk persistence | `persistSession: false` | N/A (TypeScript only) | Stateless mode |

---

*Next: [Streaming](./AGENT_SDK_STREAMING.md) · [Tools](./AGENT_SDK_TOOLS.md) · [Overview](./AGENT_SDK_OVERVIEW.md)*
