# session-usage.ts

**Path:** `apps/nakiros/src/services/runner-core/session-usage.ts`

Derives billed-equivalent token counts and agent-active timing from a Claude Code session JSONL. Bypasses the SDK stream counters (which drop `cache_read` / `cache_creation` on the floor) and reads the `usage` block on every `assistant` JSONL line directly. Used by every run kind (fix / audit / eval / create) to populate the `FixUsage` struct that the frontend renders in the run header.

## Exports

### `TOKEN_MULTIPLIER`

```ts
export const TOKEN_MULTIPLIER = {
  input: 1,
  output: 5,
  cacheRead: 0.1,
  cacheCreation5m: 1.25,
  cacheCreation1h: 2,
} as const
```

Anthropic pricing multipliers relative to base input. Centralised here as the single source of cost truth. `cacheCreation1h` (×2) reflects the 1h beta TTL that Claude Code uses by default — never hardcode the 5m multiplier.

---

### `EMPTY_SESSION_USAGE`

```ts
export const EMPTY_SESSION_USAGE: FixUsage
```

Zero-filled `FixUsage` returned when there is no session JSONL yet (run still starting or `sessionId` not yet captured). Safe to pass directly to the frontend.

---

### `computeSessionUsage`

```ts
export function computeSessionUsage(
  workdir: string,
  sessionId: string | null | undefined,
  startedAt?: string | null,
): FixUsage
```

Walk the session JSONL at `~/.claude/projects/<encoded(workdir)>/<sessionId>.jsonl` and compute a `FixUsage` with:
- Per-category token counts (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreation5m`, `cacheCreation1h`)
- `rawTotal` (simple sum) and `billedEquivalent` (pricing-weighted)
- `agentActiveMs` — sum of `(assistant_ts − prev_user_ts)` intervals; excludes user-input wait time
- `lastAssistantTurnAt` / `lastUserMessageAt` / `assistantTurns`

`startedAt` seeds the agent-active interval for the very first assistant turn (Claude Code's synthetic boot prompt may not emit a prior user line).

Returns `EMPTY_SESSION_USAGE` when `sessionId` is falsy, the file doesn't exist, or it cannot be read.

**Parameters:**
- `workdir` — absolute cwd of the claude subprocess
- `sessionId` — session id captured from the stream; pass `null` before the first `system` event
- `startedAt` — optional ISO timestamp of the run start; anchors the first assistant turn's active interval

**Returns:** populated `FixUsage`; falls back to `EMPTY_SESSION_USAGE` on any read failure

---

### `aggregateSessionUsage`

```ts
export function aggregateSessionUsage(usages: FixUsage[]): FixUsage
```

Sum a list of `FixUsage` values into a single aggregate. Used for the eval batch header where each iteration contributes its own session JSONL.

Aggregation rules: token counts and `agentActiveMs` are summed (parallel iterations all count); `assistantTurns` is summed; `lastAssistantTurnAt` / `lastUserMessageAt` take the lexicographic maximum (UTC ISO strings compare correctly as strings).

**Parameters:**
- `usages` — per-iteration usage structs; may be empty (returns `EMPTY_SESSION_USAGE`)

**Returns:** aggregate `FixUsage`
