# digest-builder

**Path:** `apps/nakiros/src/services/conversation-ingest/digest-builder.ts`

Compress a parsed Claude Code conversation into a dense, LLM-friendly text digest. Preserves all semantic signal (user + assistant text in full) but collapses tool calls into one-line summaries — a 30-turn session goes from ~80k raw tokens to ~3-5k digest tokens. Used by the V1.1 friction classifier (Haiku 4.5).

## Exports

### `buildConversationDigest`

```ts
export function buildConversationDigest(messages: ConversationMessage[]): string
```

Build the dense digest. Returns one string ready to be embedded into a `<digest>` block by the classifier prompt builder. Gap markers (`[gap Xmin]`) are inserted between turns separated by more than 5 minutes.

**Parameters:**
- `messages` — parsed turns from the session JSONL, in chronological order

**Returns:** multi-line plain-text digest string

### `estimateDigestTokens`

```ts
export function estimateDigestTokens(digest: string): number
```

Char-count → token estimate (3 chars/token, intentional slight over-estimate to err on the safe side of model windows). Mirrors `estimatePromptTokens` in `conversation-deep-analyzer.ts` so model routing stays consistent.

**Parameters:**
- `digest` — string produced by `buildConversationDigest`

**Returns:** estimated token count (ceiling)
