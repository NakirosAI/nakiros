# ADR — Token accounting and elapsed timer for run screens

**Status:** Accepted (2026-04-29)
**Scope at acceptance:** Fix screen only. To be extended to audit / eval / conversation analyzer in follow-up PRs.

## Context

Nakiros surfaces a "Tokens" counter and an "Elapsed" timer in every run screen header (fix, audit, eval, conversation diagnostic). Two problems exist on the fix screen today:

1. **The "Tokens" counter sub-counts massively.** The runner pipeline ([`apps/nakiros/src/services/runner-core/claude-stream.ts:55-58`](../../apps/nakiros/src/services/runner-core/claude-stream.ts)) reads only `total_tokens` (or `input_tokens + output_tokens` if absent) from the Claude CLI's `result` event. It silently drops `cache_read_input_tokens` and `cache_creation_input_tokens`. On a fix run with a stable prefix (typical: a copied skill source + audit + last iteration ≈ 16k–50k tokens cached), the counter shows a tiny number that's typically 80–90% off.

2. **The "Elapsed" timer keeps ticking while the agent is idle.** It's wall-clock from `run.startedAt`, so it advances during the user-input wait state — even though the AI has finished its turn and is sitting waiting for the next message. Users can't tell at a glance how long the agent actually worked.

Even if we fixed the runner to sum all four token kinds (input + output + cache_read + cache_creation), summing them flat would still be misleading — those tokens are billed at very different rates by Anthropic. A cache_read costs 10× **less** than a fresh input; an output costs 5× **more**. So the displayed sum represents neither a cost nor a coherent unit of work.

Both issues compound: the user gets an unreliable "this run cost N tokens" headline and a useless "this run took T seconds" timer. The screen claims to surface run economics but doesn't.

## Decision

### 1. Tokens counter → billed-equivalent

The "Tokens" stat in the fix screen header surfaces a single number: the **billed-equivalent token count**, computed by weighting each token kind by its Anthropic pricing multiplier relative to base input.

| Token kind | Multiplier (vs base input) |
|---|---|
| `input_tokens` | ×1 |
| `output_tokens` | ×5 |
| `cache_read_input_tokens` | ×0.1 |
| `cache_creation_input_tokens` (5-minute TTL) | ×1.25 |
| `cache_creation_input_tokens` (1-hour TTL) | ×2 |

```
billedEquivalent =
    input_tokens                   * 1
  + output_tokens                  * 5
  + cache_read_input_tokens        * 0.1
  + cache_creation_5m              * 1.25
  + cache_creation_1h              * 2
```

These multipliers are taken from the Opus 4.7 / 4.6 / Sonnet 4.x rows of Anthropic's pricing table (the ratios are model-independent — see [Anthropic prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#pricing)).

**Why this number specifically:**
- It IS in "tokens" units (no currency conversion, no per-model rate lookup needed in the UI).
- It collapses to the displayed token count when there's no cache (typical short test runs) — so backward-compatible visual.
- It surfaces the cost dimension faithfully: a 50k cache_read run shows ~5k billed-equivalent (correct — that's what it cost), not 50k (overstated).
- It separates visually from the raw context size, which is what `Sismograph` will track on its own track.

We also keep the **raw breakdown** (`inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreation5m`, `cacheCreation1h`) available in the payload so future UIs (sismograph, diagnostic panel) can show the structure.

### 2. Elapsed timer → agent-active time

The "Elapsed" stat sums the **agent-active intervals** observed in the Claude Code session JSONL: for each assistant turn, the interval is `assistant.timestamp − previous_user.timestamp` (clamped at zero, capped at a turn-max sanity bound to dodge clock skew). The first interval starts at the run's `startedAt` if no user message precedes the first assistant turn (i.e. the first turn is the auto-injected `/skill-factory fix` prompt).

```
agentActiveMs = Σ ( assistant_ts − prev_user_ts )  for every assistant turn
```

When the run is `running`, the timer ticks live from the **last user-message timestamp** (we add `now − last_user_ts` to the already-frozen `agentActiveMs` from prior turns). When the run is `waiting_for_input` or terminal, the timer freezes on the sum of completed intervals.

**Why this rule:**
- A fix conversation alternates user message → agent turn → user message → agent turn. The user's pauses between turns (reading, evaluating the agent's output, drafting a reply) shouldn't inflate "Elapsed".
- The legacy wall-clock timer made it impossible to compare two fix runs (different user attention times biased the metric).
- Agent-active time roughly correlates with model duration_ms, which is the right unit for "how hard did the AI work on this".

### 3. Source of truth → session JSONL, not the runner stream

For the fix screen specifically, both numbers are computed on demand by reading the Claude Code session JSONL at:

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
```

Each `type: assistant` line carries a `message.usage` block (with `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`) and a `timestamp`. Each `type: user` line also carries a `timestamp`.

This bypasses the runner's broken `claude-stream.ts` parsing entirely. The CLI writes the JSONL atomically and reliably, so the payload is exact.

## Implementation

- **Backend service:** `parseFixUsage(sessionFile, runStartedAt) → FixUsage` walks the JSONL once, accumulates per-turn usage and per-interval elapsed.
- **IPC channel:** `fix:getUsage(runId) → FixUsage` exposes it to the frontend.
- **Frontend:** the fix `RunScreen` polls this every ~1.5s while the run is live, less often (or once on mount) when terminal, and renders `billedEquivalent` for the Tokens stat + `agentActiveMs` for the Elapsed stat.

## Scope at acceptance

This ADR applies to the **fix screen only** as of 2026-04-29. Audit, eval, and conversation analyzer surfaces still use the legacy flat-sum tokens and wall-clock timer — to be migrated in follow-up PRs. The runner-side bug (`claude-stream.ts` dropping cache fields) is also still present and impacts eval runs that don't have a session JSONL fallback path; fixing it is tracked separately.

## Trade-offs and alternatives considered

- **Option: 4 separate token counters in the UI.** Rejected for the headline stat — the user wanted a single number. Kept for diagnostic panels / future sismograph.
- **Option: monetary cost in $ instead of billed-equivalent tokens.** Rejected — would require per-model rate lookups and currency formatting; the user prefers tokens (matches the rest of the UI vocabulary).
- **Option: keep wall-clock elapsed, add a separate "agent-active" stat.** Rejected — two timers in the header is noise. Users care about agent-active; wall-clock is recoverable from `startedAt` if ever needed.
- **Multipliers from Anthropic's table:** chosen because they're stable across the Opus 4.x and Sonnet 4.x families. Haiku and Opus 3 have the same ratios. We don't track per-run model to vary the multipliers, which would be over-engineering.
