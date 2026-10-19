# CLAUDE.md

Guidance for Claude Code and other contributors working in this repository.

## Project

A TypeScript template for MCP-based AI agents. `agent.ts` is an MCP client that spawns `server.ts` over stdio, discovers its tools, and runs an LLM-driven loop (Perceive, Decide, Act, Observe, Repeat) until the model gives a final answer. See [README.md](README.md) for the overview.

## Commands

```bash
pnpm install
pnpm test                         # vitest run
pnpm typecheck                    # tsc --noEmit
pnpm agent "your prompt"          # runs agent.ts with --env-file=.env (needs ANTHROPIC_API_KEY)
pnpm server                       # runs the MCP server standalone
```

- Node >= 22.18 runs `.ts` files directly. There is no build step and no emitted output.
- Run `pnpm typecheck` and `pnpm test` before every commit.

## Architecture

- `agent.ts`: entry point. Connects the MCP `Client` through `StdioClientTransport` (`node server.ts`), calls `perceive`, then `runAgent`.
- `server.ts`: MCP server with two tools, `list_files` and `read_files` (note the plural). Tool errors are returned as `isError: true` results, not thrown.
- `llm/types.ts`: provider-agnostic types (`LLMProvider`, `Message`, `ContentBlock`, `Tool`, `ToolCall`, `LLMResponse`).
- `llm/anthropic.ts`: `createAnthropicProvider` calls the Anthropic Messages API with `fetch`, with no SDK. It maps between the internal types and the Anthropic wire format and reads `ANTHROPIC_API_KEY`.
- `phases/`: one module per loop step.
  - `perceive.ts`: `ToolLister` -> `Tool[]`.
  - `decide.ts`: `llm.chat(messages, tools)`.
  - `act.ts`: `executeToolCalls` runs calls sequentially through a `ToolExecutor`. Errors become `ToolResult`s with `isError: true`.
  - `observe.ts`: appends the assistant message and a single user message of tool results, truncating each result to `maxToolResultChars` (default 20,000).
  - `repeat.ts`: `runAgent` returns `{ answer, history, iterations, stopReason }` where `stopReason` is `'answer'` or `'max_iterations'` (default 10 iterations). Invalid limits throw `RangeError`.

External dependencies are injected (`LLMProvider`, `ToolExecutor`, `ToolLister`) so the phases can be tested without a network or a subprocess. Keep it that way: do not import the MCP client or the Anthropic provider inside `phases/`.

## Testing

- Vitest, with test files next to the source (`foo.ts` and `foo.test.ts`).
- Arrange-Act-Assert, separated by blank lines.
- Use explicit matchers (`toEqual`, `toBe`, `toBeNull`, ...), not snapshots.
- Generate test data with `@faker-js/faker` instead of hardcoded values.
- Stub the LLM and the tool executor; tests must not call the network or spawn the server.

## Safety

- `.env` holds the API key and is gitignored. Never commit it or print its contents. Use `.env.example` for placeholders.
- The server tools can read any path on disk by design (see the Security section of the README). Do not extend them with write or execute capabilities without adding path restrictions.
