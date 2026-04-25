# claude-models.ts

**Path:** `packages/shared/src/constants/claude-models.ts`

Canonical list of Claude model aliases accepted across the Nakiros codebase (CLI `--model` flag, eval runner, comparison runner, UI badges). We use short aliases (`opus` / `sonnet` / `haiku`) rather than full version ids so the eval runner doesn't need an update every time Anthropic bumps a minor version.

## Exports

### `const CLAUDE_MODEL_IDS`

Claude model aliases accepted by the CLI's `--model` flag.

```ts
export const CLAUDE_MODEL_IDS = ['opus', 'sonnet', 'haiku'] as const;
```

### `type ClaudeModelId`

Accepted short alias for a Claude model (one of `CLAUDE_MODEL_IDS`).

```ts
export type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number];
```

### `const DEFAULT_EVAL_MODEL`

Fallback when nothing is configured for a skill. Matches the runner's historical behaviour.

```ts
export const DEFAULT_EVAL_MODEL: ClaudeModelId = 'opus';
```

### `const CLAUDE_MODEL_LABELS`

Human-readable label for each Claude model alias. Used in UI badges and selectors.

```ts
export const CLAUDE_MODEL_LABELS: Record<ClaudeModelId, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};
```

### `function isClaudeModelId`

Type guard: narrows an `unknown` value to `ClaudeModelId`.

```ts
export function isClaudeModelId(value: unknown): value is ClaudeModelId
```

**Parameters:**
- `value` — any runtime value

**Returns:** `true` when `value` is one of the aliases in `CLAUDE_MODEL_IDS`, narrowing the type.
