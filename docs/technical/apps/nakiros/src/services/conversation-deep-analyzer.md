# conversation-deep-analyzer.ts

**Path:** `apps/nakiros/src/services/conversation-deep-analyzer.ts`

LLM-powered "deep" analysis of a conversation. Consumes the stage-1 deterministic signals (from `conversation-analyzer.ts`) + raw messages, prompts Claude with the `nakiros-conversation-analyst` skill, and persists the resulting Markdown report under `~/.nakiros/analyses/<sessionId>.json` so subsequent opens don't re-bill.

**Model routing:** Haiku 4.5 (200k context, $1/M input) when the prompt fits in ~170k tokens, Sonnet 4.6 (1M context) when it doesn't. Rejects prompts above ~950k tokens.

## Exports

### `type DeepAnalysisResult`

Alias of `ConversationDeepAnalysis` for modules that only import from this file.

```ts
export type DeepAnalysisResult = ConversationDeepAnalysis;
```

### `function loadDeepAnalysis`

Lazy cache read — returns a prior analysis if one exists (under `~/.nakiros/analyses/`), without re-running the LLM.

```ts
export function loadDeepAnalysis(sessionId: string): DeepAnalysisResult | null
```

### `function runDeepAnalysis`

Run deep analysis on a conversation. Builds the prompt, picks the right model for its size, spawns `claude --print`, persists the report. Legacy one-shot entry point — the streaming `analyze-convo-runner` reuses the building blocks below instead.

**Throws:** `Error` — on CLI failure OR when the conversation exceeds the max prompt size (~950k tokens). The caller surfaces the message to the UI.

```ts
export async function runDeepAnalysis(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): Promise<DeepAnalysisResult>
```

### `const HAIKU_MODEL` / `const SONNET_MODEL`

Claude CLI model ids: `'haiku'` (200k context) and `'sonnet'` (1M context). Exposed for runners that need to reuse the same routing decision.

### `const HAIKU_INPUT_BUDGET` / `const MAX_PROMPT_TOKENS`

Routing thresholds. Below `HAIKU_INPUT_BUDGET` (170k) Haiku is preferred — it leaves headroom for the skill body + output. Above `MAX_PROMPT_TOKENS` (~950k) the prompt is rejected outright.

### `const ANALYSES_DIR`

Absolute path of the persisted-reports cache (`~/.nakiros/analyses/`). Reused by `analyze-convo-runner` to archive its final report under the same canonical location.

### `function buildAnalyzeConvoPrompt`

Build the prompt sent to Claude for a deep conversation analysis. Combines stage-1 deterministic signals + the raw turn-by-turn conversation, wrapped in `<instructions>` / `<stage1-signals>` / `<conversation>` blocks. Exposed so the streaming `analyze-convo-runner` can reuse the same prompt shape as the legacy one-shot.

```ts
export function buildAnalyzeConvoPrompt(
  stage1: ConversationAnalysis,
  messages: ReturnType<typeof getConversationMessages>,
): string
```

### `function estimatePromptTokens`

Char-count → token estimate (3 chars/token, intentional slight over-estimate that keeps us on the safe side of Claude model windows). Used for model routing — not a substitute for the real tokenizer.

```ts
export function estimatePromptTokens(text: string): number
```

### `function analysisFilePath`

Cached report path for a session id (`~/.nakiros/analyses/<sessionId>.json`).

```ts
export function analysisFilePath(sessionId: string): string
```

### `function persistAnalysis`

Persist a completed deep-analysis report to the shared cache directory. Used by both `runDeepAnalysis` and the streaming `analyze-convo-runner` so the cache stays canonical regardless of which entry point produced the report.

```ts
export function persistAnalysis(result: DeepAnalysisResult): void
```
