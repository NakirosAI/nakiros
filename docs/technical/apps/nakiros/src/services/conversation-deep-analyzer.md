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

Run deep analysis on a conversation. Builds the prompt, picks the right model for its size, spawns `claude --print`, persists the report.

**Throws:** `Error` — on CLI failure OR when the conversation exceeds the max prompt size (~950k tokens). The caller surfaces the message to the UI.

```ts
export async function runDeepAnalysis(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): Promise<DeepAnalysisResult>
```
