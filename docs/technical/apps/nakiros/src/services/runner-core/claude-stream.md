# claude-stream.ts

**Path:** `apps/nakiros/src/services/runner-core/claude-stream.ts`

Spawn + consume one `claude` CLI turn. Owns the argv construction, the stream-json parsing, and the child-process lifecycle. Every runner (eval / audit / fix / create / comparison) layers domain state on top of these primitives.

## Exports

### `interface ClaudeStreamHandlers`

Domain-agnostic callbacks invoked by `handleClaudeStreamEvent` while consuming the stream. Each runner wires its own implementation to route events into its run state.

```ts
export interface ClaudeStreamHandlers {
  onSession(id: string): void;
  onText(text: string): void;
  onTool(name: string, display: string): void;
  onUsage(totalTokens: number): void;
}
```

### `function handleClaudeStreamEvent`

Parse a single JSON event from the `claude --output-format stream-json` stream and dispatch to the handlers. Handles `system`, `assistant` (text + tool_use blocks), and `result` (usage → `onUsage`).

```ts
export function handleClaudeStreamEvent(event: Record<string, unknown>, h: ClaudeStreamHandlers): void
```

### `interface BuildArgsOptions`

Options for `buildClaudeArgs`.

```ts
export interface BuildArgsOptions {
  prompt: string;
  resumeSessionId?: string;
  addDirs?: string[];
  /** Pass `--dangerously-skip-permissions`. Used by fix/create runs that operate on an already-confirmed temp workdir. */
  skipPermissions?: boolean;
  /** Claude model id (e.g. `claude-opus-4-7`). Forwarded as `--model <id>`. */
  model?: string;
}
```

### `function buildClaudeArgs`

Build the `claude` CLI argv for one turn. Always enables `--output-format stream-json --verbose`; additional flags opt-in via `opts`. The prompt is passed via `--print` (not stdin) so the CLI exits after one turn.

```ts
export function buildClaudeArgs(opts: BuildArgsOptions): string[]
```

### `interface SpawnTurnOptions`

Options for `spawnClaudeTurn` — extends `ClaudeStreamHandlers` with process lifecycle hooks. `onChildSpawned` lets the caller stash the ChildProcess to `SIGTERM` it on stop; `isKilled` short-circuits stream handling; `env` overrides the child environment (used to set `HOME` to the isolated home).

### `interface SpawnTurnResult`

Outcome of a single `spawnClaudeTurn` invocation.

```ts
export interface SpawnTurnResult {
  exitCode: number;
  /** Tail of stderr when the exit code is non-zero, trimmed to 500 chars. */
  error: string | null;
}
```

### `function spawnClaudeTurn`

Spawn a single claude CLI turn and drain its stdout/stderr. Dispatches parsed events into the provided handlers. Returns once the child exits. Detects `ENOENT` and surfaces a user-friendly "CLI not found" error.

```ts
export function spawnClaudeTurn(opts: SpawnTurnOptions): Promise<SpawnTurnResult>
```
