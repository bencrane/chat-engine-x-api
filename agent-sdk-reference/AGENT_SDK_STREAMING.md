# Agent SDK Streaming

> Part of the [Agent SDK Reference](./REPO_MAP.md) for chat-engine-x-api-v2
> Source: Synthesized from Anthropic Agent SDK documentation (March 2026)
> SDK Version: `@anthropic-ai/claude-agent-sdk` v0.2.86 (TypeScript) / `claude-agent-sdk` (Python)

---

## Table of Contents

1. [Two Input Modes](#1-two-input-modes)
2. [Streaming Input Mode](#2-streaming-input-mode)
3. [Single Message Input](#3-single-message-input)
4. [Output Streaming](#4-output-streaming)
5. [StreamEvent Reference](#5-streamevent-reference)
6. [Streaming Text Responses](#6-streaming-text-responses)
7. [Streaming Tool Calls](#7-streaming-tool-calls)
8. [Building a Streaming UI](#8-building-a-streaming-ui)
9. [SSE Integration](#9-sse-integration)
10. [Known Limitations](#10-known-limitations)

---

## 1. Two Input Modes

The Agent SDK supports two input modes. Choose based on your application requirements:

| Feature | Streaming Input (Default) | Single Message Input |
|---------|--------------------------|---------------------|
| Image uploads | Yes | No |
| Queued messages | Yes | No |
| Real-time interruption | Yes | No |
| Hook integration | Yes | No |
| Multi-turn conversations | Natural | Via session resume |
| Context persistence | Automatic | Via `continue: true` |
| Serverless/Lambda compatible | No | Yes |

**Decision rule:** Use streaming input unless you're in a stateless environment (Lambda, edge functions) or only need one-shot responses.

---

## 2. Streaming Input Mode

Streaming input mode is the default and recommended approach. It provides a persistent, interactive session using an async generator to feed messages to the agent.

### Benefits

- **Image uploads**: Attach images directly to messages for visual analysis
- **Queued messages**: Send multiple messages that process sequentially, with ability to interrupt
- **Tool integration**: Full access to all tools and custom MCP servers during the session
- **Hooks support**: Use lifecycle hooks to customize behavior at various points
- **Real-time feedback**: See responses as they're generated
- **Context persistence**: Maintain conversation context across turns naturally

### TypeScript Implementation

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "fs/promises";

async function* generateMessages() {
  // First message: text only
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "Analyze this codebase for security issues"
    }
  };

  // Wait for some condition, then send follow-up
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Second message: text + image
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [
        { type: "text", text: "Review this architecture diagram" },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: await readFile("diagram.png", "base64")
          }
        }
      ]
    }
  };
}

for await (const message of query({
  prompt: generateMessages(),
  options: { maxTurns: 10, allowedTools: ["Read", "Grep"] }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}
```

### Python Implementation

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def generate_messages():
    yield {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Analyze this codebase for security issues"
        }
    }

    await asyncio.sleep(2)

    yield {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Now focus on the authentication module"
        }
    }

async def main():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Grep"],
        max_turns=10,
    )

    async for message in query(prompt=generate_messages(), options=options):
        if hasattr(message, "result"):
            print(message.result)

asyncio.run(main())
```

---

## 3. Single Message Input

Use single message input for one-shot queries or stateless environments.

### Limitations

- No image attachments
- No dynamic message queueing
- No real-time interruption
- No hook integration
- Multi-turn requires session management (`continue: true` or `resume`)

### Implementation

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// One-shot query
for await (const message of query({
  prompt: "Explain the authentication flow",
  options: { maxTurns: 1, allowedTools: ["Read", "Grep"] }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}

// Continue with session management
for await (const message of query({
  prompt: "Now explain the authorization process",
  options: { continue: true, maxTurns: 1 }
})) {
  if (message.type === "result") {
    console.log(message.result);
  }
}
```

---

## 4. Output Streaming

By default, the SDK yields complete `AssistantMessage` objects after Claude finishes each response. To receive incremental updates as text and tool calls are generated, enable partial message streaming.

### Enable Streaming Output

| SDK | Option | Type |
|-----|--------|------|
| TypeScript | `includePartialMessages: true` | boolean |
| Python | `include_partial_messages=True` | bool |

When enabled, the SDK yields `StreamEvent` messages containing raw API events as they arrive, in addition to the usual `AssistantMessage` and `ResultMessage`.

### Message Flow With Streaming

```
1.  StreamEvent (message_start)
2.  StreamEvent (content_block_start) — text block
3.  StreamEvent (content_block_delta) — text chunks...
4.  StreamEvent (content_block_stop)
5.  StreamEvent (content_block_start) — tool_use block
6.  StreamEvent (content_block_delta) — tool input chunks...
7.  StreamEvent (content_block_stop)
8.  StreamEvent (message_delta)
9.  StreamEvent (message_stop)
10. AssistantMessage — complete message with all content
11. ... tool executes ...
12. ... more streaming events for next turn ...
13. ResultMessage — final result
```

### Message Flow Without Streaming

Without `includePartialMessages`, you receive:
- `SystemMessage` — session initialization
- `AssistantMessage` — complete responses (after each turn)
- `CompactBoundaryMessage` — when history is compacted
- `ResultMessage` — final result

---

## 5. StreamEvent Reference

### Structure

```typescript
// TypeScript: SDKPartialAssistantMessage with type: 'stream_event'
interface StreamEvent {
  type: "stream_event";
  uuid: string;           // Unique identifier for this event
  session_id: string;     // Session identifier
  event: object;          // The raw Claude API stream event
  parent_tool_use_id: string | null;  // Parent tool ID if from a subagent
}
```

```python
@dataclass
class StreamEvent:
    uuid: str                          # Unique identifier
    session_id: str                    # Session identifier
    event: dict[str, Any]             # The raw Claude API stream event
    parent_tool_use_id: str | None    # Parent tool ID if from a subagent
```

### Event Types

| Event Type | Description | Key Fields |
|-----------|-------------|------------|
| `message_start` | Start of a new message | `message.id`, `message.model` |
| `content_block_start` | Start of a content block | `content_block.type` ("text" or "tool_use"), `content_block.name` (tool name) |
| `content_block_delta` | Incremental update | `delta.type` ("text_delta" or "input_json_delta"), `delta.text` or `delta.partial_json` |
| `content_block_stop` | End of a content block | `index` |
| `message_delta` | Message-level updates | `delta.stop_reason`, `usage.output_tokens` |
| `message_stop` | End of the message | — |

---

## 6. Streaming Text Responses

To display text as it's generated, look for `content_block_delta` events where `delta.type` is `text_delta`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Explain how databases work",
  options: { includePartialMessages: true }
})) {
  if (message.type === "stream_event") {
    const event = message.event;
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }
}
```

```python
from claude_agent_sdk import query, ClaudeAgentOptions
from claude_agent_sdk.types import StreamEvent
import asyncio

async def stream_text():
    options = ClaudeAgentOptions(include_partial_messages=True)

    async for message in query(prompt="Explain how databases work", options=options):
        if isinstance(message, StreamEvent):
            event = message.event
            if event.get("type") == "content_block_delta":
                delta = event.get("delta", {})
                if delta.get("type") == "text_delta":
                    print(delta.get("text", ""), end="", flush=True)

    print()  # Final newline

asyncio.run(stream_text())
```

---

## 7. Streaming Tool Calls

Tool calls stream incrementally via three event types:

1. `content_block_start` — tool begins (contains `content_block.name`)
2. `content_block_delta` with `input_json_delta` — input chunks arrive
3. `content_block_stop` — tool call complete

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let currentTool: string | null = null;
let toolInput = "";

for await (const message of query({
  prompt: "Read the README.md file",
  options: { includePartialMessages: true, allowedTools: ["Read", "Bash"] }
})) {
  if (message.type !== "stream_event") continue;
  const event = message.event;

  if (event.type === "content_block_start") {
    const block = event.content_block;
    if (block?.type === "tool_use") {
      currentTool = block.name;
      toolInput = "";
      console.log(`Starting tool: ${currentTool}`);
    }
  } else if (event.type === "content_block_delta") {
    if (event.delta?.type === "input_json_delta") {
      toolInput += event.delta.partial_json;
    }
  } else if (event.type === "content_block_stop") {
    if (currentTool) {
      console.log(`Tool ${currentTool} called with: ${toolInput}`);
      currentTool = null;
    }
  }
}
```

```python
async def stream_tool_calls():
    options = ClaudeAgentOptions(
        include_partial_messages=True,
        allowed_tools=["Read", "Bash"],
    )

    current_tool = None
    tool_input = ""

    async for message in query(prompt="Read the README.md file", options=options):
        if isinstance(message, StreamEvent):
            event = message.event
            event_type = event.get("type")

            if event_type == "content_block_start":
                content_block = event.get("content_block", {})
                if content_block.get("type") == "tool_use":
                    current_tool = content_block.get("name")
                    tool_input = ""

            elif event_type == "content_block_delta":
                delta = event.get("delta", {})
                if delta.get("type") == "input_json_delta":
                    tool_input += delta.get("partial_json", "")

            elif event_type == "content_block_stop":
                if current_tool:
                    print(f"Tool {current_tool} called with: {tool_input}")
                    current_tool = None
```

---

## 8. Building a Streaming UI

Combine text and tool streaming into a cohesive interface. Track `in_tool` state to show status indicators during tool execution:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let inTool = false;

for await (const message of query({
  prompt: "Find all TODO comments in the codebase",
  options: {
    includePartialMessages: true,
    allowedTools: ["Read", "Bash", "Grep"]
  }
})) {
  if (message.type === "stream_event") {
    const event = message.event;

    if (event.type === "content_block_start") {
      if (event.content_block?.type === "tool_use") {
        process.stdout.write(`\n[Using ${event.content_block.name}...]`);
        inTool = true;
      }
    } else if (event.type === "content_block_delta") {
      if (event.delta?.type === "text_delta" && !inTool) {
        process.stdout.write(event.delta.text);
      }
    } else if (event.type === "content_block_stop") {
      if (inTool) {
        console.log(" done");
        inTool = false;
      }
    }
  } else if (message.type === "result") {
    console.log("\n--- Complete ---");
  }
}
```

```python
import sys
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage
from claude_agent_sdk.types import StreamEvent

async def streaming_ui():
    options = ClaudeAgentOptions(
        include_partial_messages=True,
        allowed_tools=["Read", "Bash", "Grep"],
    )

    in_tool = False

    async for message in query(
        prompt="Find all TODO comments in the codebase", options=options
    ):
        if isinstance(message, StreamEvent):
            event = message.event
            event_type = event.get("type")

            if event_type == "content_block_start":
                content_block = event.get("content_block", {})
                if content_block.get("type") == "tool_use":
                    tool_name = content_block.get("name")
                    print(f"\n[Using {tool_name}...]", end="", flush=True)
                    in_tool = True

            elif event_type == "content_block_delta":
                delta = event.get("delta", {})
                if delta.get("type") == "text_delta" and not in_tool:
                    sys.stdout.write(delta.get("text", ""))
                    sys.stdout.flush()

            elif event_type == "content_block_stop":
                if in_tool:
                    print(" done", flush=True)
                    in_tool = False

        elif isinstance(message, ResultMessage):
            print(f"\n\n--- Complete ---")
```

---

## 9. SSE Integration

To stream Agent SDK responses to a frontend via Server-Sent Events, transform `StreamEvent` messages into SSE format. This pattern is critical for chat-engine-x's architecture.

### Hono SSE Example

```typescript
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { query } from "@anthropic-ai/claude-agent-sdk";

const app = new Hono();

app.post("/api/chat", async (c) => {
  const { prompt } = await c.req.json();

  return stream(c, async (sseStream) => {
    for await (const message of query({
      prompt,
      options: {
        includePartialMessages: true,
        allowedTools: ["Read", "Grep", "Glob"]
      }
    })) {
      if (message.type === "stream_event") {
        const event = message.event;

        // Text delta → stream to client
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          await sseStream.write(`data: ${JSON.stringify({
            type: "text-delta",
            textDelta: event.delta.text
          })}\n\n`);
        }

        // Tool start → stream status
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          await sseStream.write(`data: ${JSON.stringify({
            type: "tool-call-begin",
            toolName: event.content_block.name
          })}\n\n`);
        }

        // Tool done
        if (event.type === "content_block_stop") {
          await sseStream.write(`data: ${JSON.stringify({
            type: "tool-call-end"
          })}\n\n`);
        }
      } else if (message.type === "result") {
        await sseStream.write(`data: ${JSON.stringify({
          type: "finish",
          result: message.result,
          cost: message.total_cost_usd
        })}\n\n`);
      }
    }
  });
});
```

### UIMessage Stream Mapping

For compatibility with Vercel AI SDK's `useChat()` on the frontend, map Agent SDK events to the UIMessage stream format:

| Agent SDK Event | UIMessage Equivalent |
|----------------|---------------------|
| `content_block_delta` (text_delta) | `0:` text stream part |
| `content_block_start` (tool_use) | `9:` tool call begin |
| `content_block_delta` (input_json_delta) | `a:` tool call delta |
| `content_block_stop` (tool_use) | `b:` tool call end |
| `ResultMessage` | `d:` finish message |

> **Gap note:** The exact UIMessage stream protocol mapping depends on the AI SDK version in use. The above is a conceptual mapping — verify against `ai` package v6 stream protocol documentation.

---

## 10. Known Limitations

| Limitation | Details |
|-----------|---------|
| **Extended thinking** | When `maxThinkingTokens` (TS) / `max_thinking_tokens` (Python) is explicitly set, `StreamEvent` messages are not emitted. Only complete messages are yielded after each turn. Thinking is disabled by default, so streaming works unless you enable it. |
| **Structured output** | The JSON result appears only in the final `ResultMessage.structured_output`, not as streaming deltas. |
| **Subagent streaming** | Stream events from subagents include `parent_tool_use_id` but arrive interleaved with parent events. You must track `parent_tool_use_id` to correctly attribute events. |

---

## Quick Reference

| Option | TypeScript | Python | Purpose |
|--------|-----------|--------|---------|
| Enable output streaming | `includePartialMessages: true` | `include_partial_messages=True` | Receive `StreamEvent` messages |
| Streaming input | Pass async generator to `prompt` | Pass async generator to `prompt` | Interactive session with queued messages |
| Single message | Pass string to `prompt` | Pass string to `prompt` | One-shot queries |
| V2 streaming | `session.stream()` | N/A (TypeScript only) | Simplified V2 API |

---

*Next: [Sessions](./AGENT_SDK_SESSIONS.md) · [Skills & Prompts](./AGENT_SDK_SKILLS_AND_PROMPTS.md) · [Overview](./AGENT_SDK_OVERVIEW.md)*
