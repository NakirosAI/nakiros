---
paths:
  - "apps/nakiros/src/services/runner-core/session-jsonl.ts"
  - "apps/nakiros/src/services/runner-core/session-usage.ts"
  - "apps/nakiros/src/services/conversation-analyzer.ts"
  - "apps/nakiros/src/services/conversation-deep-analyzer.ts"
  - "apps/frontend/src/lib/run-display.ts"
  - "apps/frontend/src/components/runs/**"
  - "apps/frontend/src/components/viz/**"
---

# Rule — Token & cost accounting

The number we display to the user as "tokens" is the **billed-equivalent**,
not the raw stream count. Same for cost. Same for the elapsed timer.

## Source of truth

The session JSONL written by Claude Code is the only source of truth for
per-run accounting. Do **not** parse the SDK stream events or maintain a
custom in-memory counter — both diverge from what Claude Code itself reports.

Helpers:

- `apps/nakiros/src/services/runner-core/session-jsonl.ts` — line iterator
  + parsing.
- `apps/nakiros/src/services/runner-core/session-usage.ts` — billing math.

If you need accounting in a new place, **call these helpers**. If you find
yourself rewriting the math, you're duplicating — stop and lift instead.

## Billed-equivalent multipliers

Apply per token category:

| Category | Multiplier |
|----------|-----------|
| `input` | ×1 |
| `output` | ×5 |
| `cache_creation` (5m) | ×1.25 |
| `cache_creation` (1h beta) | ×2 |
| `cache_read` | ×0.1 |

**Claude Code defaults to the 1h cache beta** (`ephemeral_1h_input_tokens`).
TTL is 60 min, not 5 min. Auto-detect from the session JSONL — never
hardcode 5m.

## Elapsed timer

The "Elapsed" / "Active" timer is **agent-active time**, not wall clock:
sum of intervals `assistant_ts − previous_user_ts`. The user is not "active"
while waiting for input.

## UI recommendations

When the UI surfaces a recommendation about cost or cache to the user, it
must be **actionable by a Claude Code user**. Do not surface API/SDK params
they cannot control (e.g., "enable 1h cache" — Claude Code already does that).

## ADR

The full reasoning lives in `docs/decisions/token-accounting.md`. Read it if
you're touching this area for the first time.
