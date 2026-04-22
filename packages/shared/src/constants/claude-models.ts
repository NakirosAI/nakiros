/**
 * Claude model aliases accepted by the CLI's `--model` flag. We use the
 * short aliases (`opus` / `sonnet` / `haiku`) rather than full version ids
 * (`claude-opus-4-7`…) so the eval runner doesn't need an update every time
 * Anthropic bumps a minor version.
 */
export const CLAUDE_MODEL_IDS = ['opus', 'sonnet', 'haiku'] as const;

export type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number];

/** Fallback when nothing is configured for a skill. Matches the runner's historical behaviour. */
export const DEFAULT_EVAL_MODEL: ClaudeModelId = 'opus';

export const CLAUDE_MODEL_LABELS: Record<ClaudeModelId, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

export function isClaudeModelId(value: unknown): value is ClaudeModelId {
  return typeof value === 'string' && (CLAUDE_MODEL_IDS as readonly string[]).includes(value);
}
