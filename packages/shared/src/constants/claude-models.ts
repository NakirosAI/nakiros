/**
 * Claude model aliases accepted by the CLI's `--model` flag. We use the
 * short aliases (`opus` / `sonnet` / `haiku`) rather than full version ids
 * (`claude-opus-4-7`…) so the eval runner doesn't need an update every time
 * Anthropic bumps a minor version.
 */
export const CLAUDE_MODEL_IDS = ['opus', 'sonnet', 'haiku'] as const;

/** Accepted short alias for a Claude model (one of {@link CLAUDE_MODEL_IDS}). */
export type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number];

/** Fallback when nothing is configured for a skill. Matches the runner's historical behaviour. */
export const DEFAULT_EVAL_MODEL: ClaudeModelId = 'opus';

/** Human-readable label for each Claude model alias. Used in UI badges and selectors. */
export const CLAUDE_MODEL_LABELS: Record<ClaudeModelId, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

/** Type guard: narrows an `unknown` value to {@link ClaudeModelId}. */
export function isClaudeModelId(value: unknown): value is ClaudeModelId {
  return typeof value === 'string' && (CLAUDE_MODEL_IDS as readonly string[]).includes(value);
}

/**
 * Maps each short alias to the full Claude model id currently considered
 * "current" by Nakiros. Bumped manually when Anthropic releases a new
 * minor version of a model line.
 *
 * Used by the eval baseline cache: a baseline persisted with a `model_full_id`
 * that no longer appears in this map is flagged as obsolete and the user is
 * prompted to recompute (see `docs/refactoring/08-baseline-per-model.md`).
 */
export const CURRENT_MODEL_FULL_IDS: Record<ClaudeModelId, string> = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

/**
 * Resolve a model identifier (alias OR full id) to a stable full id. Always
 * returns a deterministic full id so callers can use the result as a cache
 * key without aliasing collisions.
 *
 * - `'opus'` → `'claude-opus-4-7'` (today's CURRENT_MODEL_FULL_IDS.opus)
 * - `'claude-opus-4-6'` → `'claude-opus-4-6'` (passthrough — already a full id)
 * - `'claude-sonnet-4-6'` → `'claude-sonnet-4-6'`
 *
 * Anything starting with `claude-` is treated as a full id and returned as-is.
 * An unknown short alias is returned untouched (avoids silent misroutes —
 * caller decides what to do with an unrecognized value).
 */
export function resolveModelFullId(model: string): string {
  if (model.startsWith('claude-')) return model;
  if (isClaudeModelId(model)) return CURRENT_MODEL_FULL_IDS[model];
  return model;
}

/**
 * Returns true iff `modelFullId` is currently considered the canonical
 * "current" version of one of the model lines. Used to flag cached baselines
 * as obsolete when Anthropic ships a new minor (e.g. Opus 4.6 → 4.7).
 */
export function isCurrentModelFullId(modelFullId: string): boolean {
  for (const id of Object.values(CURRENT_MODEL_FULL_IDS)) {
    if (id === modelFullId) return true;
  }
  return false;
}
