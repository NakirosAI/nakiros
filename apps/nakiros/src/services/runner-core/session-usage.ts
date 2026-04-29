/**
 * Per-session token + timing accounting derived directly from Claude Code's
 * session jsonl. Single source of cost truth — bypasses the runner's own
 * tally because `claude-stream.ts` currently drops cache_read /
 * cache_creation on the floor (see
 * `project_nakiros_cache_accounting_gaps_2026_04_28.md`).
 *
 * Two outputs:
 *   - `billedEquivalent` — pricing-weighted sum (cache_read ×0.1 ≪ output ×5)
 *     so the UI surfaces a coherent cost signal regardless of cache hit rate.
 *   - `agentActiveMs` — sum of `(assistant_ts − prev_user_ts)` intervals,
 *     i.e. wall-clock the model actually spent generating, excluding
 *     user-input pauses.
 *
 * Multipliers and rationale: see [docs/decisions/token-accounting.md].
 */
import { existsSync, readFileSync } from 'fs';

import type { FixUsage } from '@nakiros/shared';

import { getSessionJsonlPath } from './session-jsonl.js';

/**
 * Anthropic's pricing multipliers relative to base input. Centralised here
 * so the single source of cost truth lives next to the parser.
 */
export const TOKEN_MULTIPLIER = {
  input: 1,
  output: 5,
  cacheRead: 0.1,
  cacheCreation5m: 1.25,
  cacheCreation1h: 2,
} as const;

/** Empty-state value returned when there's no session jsonl yet. */
export const EMPTY_SESSION_USAGE: FixUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreation5m: 0,
  cacheCreation1h: 0,
  rawTotal: 0,
  billedEquivalent: 0,
  agentActiveMs: 0,
  lastAssistantTurnAt: null,
  lastUserMessageAt: null,
  assistantTurns: 0,
};

/**
 * Walk the session jsonl at `~/.claude/projects/<encoded(workdir)>/<sessionId>.jsonl`
 * and compute the {@link FixUsage} (despite the name, the type is generic
 * across run kinds — fix / audit / eval).
 *
 * `startedAt` seeds the agent-active interval for the very first assistant
 * turn (otherwise that turn would be skipped because no prior user line
 * exists in the jsonl — Claude Code injects a synthetic boot prompt that
 * doesn't always carry a user line). Pass the run's `startedAt` ISO if you
 * want the first turn to count.
 *
 * Returns {@link EMPTY_SESSION_USAGE} when the file isn't there yet (run
 * still starting / sessionId not captured) or can't be read.
 */
export function computeSessionUsage(
  workdir: string,
  sessionId: string | null | undefined,
  startedAt?: string | null,
): FixUsage {
  if (!sessionId) return EMPTY_SESSION_USAGE;

  const sessionFile = getSessionJsonlPath(workdir, sessionId);
  if (!existsSync(sessionFile)) return EMPTY_SESSION_USAGE;

  let raw: string;
  try {
    raw = readFileSync(sessionFile, 'utf8');
  } catch {
    return EMPTY_SESSION_USAGE;
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreation5m = 0;
  let cacheCreation1h = 0;
  let agentActiveMs = 0;
  let assistantTurns = 0;
  let lastAssistantTurnAt: string | null = null;
  let lastUserMessageAt: string | null = null;

  // Seed with `startedAt` so the first assistant turn (which immediately
  // follows the auto-injected boot prompt) gets a sensible start anchor
  // instead of being skipped.
  let prevUserTs: string | null = startedAt ?? null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const obj = parsed as {
      type?: string;
      timestamp?: string;
      isMeta?: boolean;
      isSidechain?: boolean;
      message?: {
        role?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_creation?: {
            ephemeral_5m_input_tokens?: number;
            ephemeral_1h_input_tokens?: number;
          };
        };
      };
    };

    if (obj.isMeta) continue;
    if (obj.isSidechain) continue;
    const ts = typeof obj.timestamp === 'string' ? obj.timestamp : null;
    if (!ts) continue;

    if (obj.type === 'user') {
      lastUserMessageAt = ts;
      prevUserTs = ts;
      continue;
    }

    if (obj.type !== 'assistant') continue;

    const usage = obj.message?.usage;
    if (usage) {
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      // The CLI sometimes reports cache_creation_input_tokens at the
      // top-level only, sometimes inside `cache_creation.ephemeral_*`.
      // Prefer the granular breakdown when present so we apply the right
      // 5m/1h multiplier; fall back to the top-level (treat as 5m, the
      // default TTL) when the granular block is missing.
      const granular = usage.cache_creation;
      if (granular) {
        cacheCreation5m += granular.ephemeral_5m_input_tokens ?? 0;
        cacheCreation1h += granular.ephemeral_1h_input_tokens ?? 0;
      } else if (usage.cache_creation_input_tokens) {
        cacheCreation5m += usage.cache_creation_input_tokens;
      }
    }

    // Agent-active interval: from the previous user message (or run
    // start, for the first turn) to this assistant turn's timestamp.
    // Negative deltas (clock skew, replays) are clamped at 0.
    if (prevUserTs) {
      const delta = new Date(ts).getTime() - new Date(prevUserTs).getTime();
      if (Number.isFinite(delta) && delta > 0) agentActiveMs += delta;
    }
    // After an assistant turn, the next active interval starts only
    // when the user replies — until then we're in waiting_for_input
    // and time should NOT count.
    prevUserTs = null;

    lastAssistantTurnAt = ts;
    assistantTurns += 1;
  }

  const rawTotal =
    inputTokens + outputTokens + cacheReadTokens + cacheCreation5m + cacheCreation1h;
  const billedEquivalent = Math.round(
    inputTokens * TOKEN_MULTIPLIER.input +
      outputTokens * TOKEN_MULTIPLIER.output +
      cacheReadTokens * TOKEN_MULTIPLIER.cacheRead +
      cacheCreation5m * TOKEN_MULTIPLIER.cacheCreation5m +
      cacheCreation1h * TOKEN_MULTIPLIER.cacheCreation1h,
  );

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreation5m,
    cacheCreation1h,
    rawTotal,
    billedEquivalent,
    agentActiveMs,
    lastAssistantTurnAt,
    lastUserMessageAt,
    assistantTurns,
  };
}

/**
 * Sum a list of {@link FixUsage} into a single aggregate. Used for the
 * eval batch header where each iteration carries its own session JSONL.
 *
 * Aggregation rules:
 * - Token counts: simple sum.
 * - `agentActiveMs`: sum (parallel iterations DO add their concurrent
 *   active time; we want "total agent compute spent on this batch", not
 *   wall-clock).
 * - `assistantTurns`: sum.
 * - `lastAssistantTurnAt` / `lastUserMessageAt`: max ISO (lexicographic
 *   compare on UTC ISO is correct).
 */
export function aggregateSessionUsage(usages: FixUsage[]): FixUsage {
  const out: FixUsage = { ...EMPTY_SESSION_USAGE };
  for (const u of usages) {
    out.inputTokens += u.inputTokens;
    out.outputTokens += u.outputTokens;
    out.cacheReadTokens += u.cacheReadTokens;
    out.cacheCreation5m += u.cacheCreation5m;
    out.cacheCreation1h += u.cacheCreation1h;
    out.rawTotal += u.rawTotal;
    out.billedEquivalent += u.billedEquivalent;
    out.agentActiveMs += u.agentActiveMs;
    out.assistantTurns += u.assistantTurns;
    if (u.lastAssistantTurnAt && (!out.lastAssistantTurnAt || u.lastAssistantTurnAt > out.lastAssistantTurnAt)) {
      out.lastAssistantTurnAt = u.lastAssistantTurnAt;
    }
    if (u.lastUserMessageAt && (!out.lastUserMessageAt || u.lastUserMessageAt > out.lastUserMessageAt)) {
      out.lastUserMessageAt = u.lastUserMessageAt;
    }
  }
  return out;
}
