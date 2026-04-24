# conversation-analyzer.ts

**Path:** `apps/nakiros/src/services/conversation-analyzer.ts`

Deterministic (no-LLM) analysis of a Claude Code conversation. Walks the JSONL once and computes: compactions, per-tool stats + errors, friction points (FR/EN pattern match on user messages), cache waste (attributed to `cache_creation_input_tokens` on turns that arrived > 5 min after the last assistant reply), hot files (≥ 3 edits), sidechain count, slash commands, and a 0-100 composite health score with a rule-based diagnostic + up to 5 actionable tips.

**Context-window detection** scales health zones automatically: standard 200k, or auto-detected 1M when peak usage crosses ~250k tokens.

**Score weights** are tuned to put problem conversations in the 60-100 penalty range and clean ones under 20. Exposed as internal constants so they can be retuned after batch runs.

## Exports

### `function analyzeConversation`

Full deterministic analysis of a single JSONL conversation. Returns `null` when the file is missing or empty.

```ts
export function analyzeConversation(
  providerProjectDir: string,
  sessionId: string,
  projectId: string,
): ConversationAnalysis | null
```
