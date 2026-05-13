# cluster-tokens.ts

**Path:** `apps/nakiros/src/services/runner-core/cluster-tokens.ts`

Tokenization primitives for Jaccard-based clustering. Shared between `conversation-analyzer` (friction zone detection) and the upcoming `recommendation-cluster` module (pattern detection across zones). Both must use the same stop-word list, regex, and min-length threshold so similarity scores are directly comparable.

## Exports

### `STOP_WORDS`

```ts
export const STOP_WORDS: Set<string>
```

French + English function words (case-insensitive). Common connectors, pronouns, prepositions, and verbs that carry no topical meaning. Excluding them prevents unrelated messages from appearing similar merely because they share grammatical glue.

---

### `SYNTHETIC_USER_TEXTS`

```ts
export const SYNTHETIC_USER_TEXTS: Set<string>
```

The two literal strings Claude Code injects as fake user turns when the user presses ESC to interrupt a tool (`[Request interrupted by user for tool use]` and `[Request interrupted by user]`). Code that iterates real user messages must filter these out — they are not authored content.

---

### `isSyntheticUserMessage`

```ts
export function isSyntheticUserMessage(text: string): boolean
```

Returns `true` when `text` (after trimming) matches a known synthetic interrupt message. Use to guard any loop over user messages before tokenizing or clustering.

**Parameters:**
- `text` — raw user message text

**Returns:** `true` if the message is a synthetic interrupt, `false` otherwise

---

### `tokenizeForCluster`

```ts
export function tokenizeForCluster(text: string): Set<string>
```

Tokenize a string for Jaccard clustering:
1. Lowercase
2. Split on `/\W+/` (all non-word characters)
3. Drop tokens shorter than 3 characters
4. Drop tokens present in `STOP_WORDS`

Returns a `Set<string>` of content-bearing tokens. The set representation ensures each token is counted once (no TF weighting), which is correct for Jaccard.

**Parameters:**
- `text` — raw message text

**Returns:** set of content-bearing tokens

---

### `jaccard`

```ts
export function jaccard(a: Set<string>, b: Set<string>): number
```

Jaccard similarity: `|A ∩ B| / |A ∪ B|`. Returns `0` when either set is empty (avoids a spurious `1.0` when both token sets are empty, which would falsely flag two empty messages as identical).

Used as the similarity metric in both the stuck-cluster zone detector (threshold 0.3) and the repetition detector (threshold 0.5).

**Parameters:**
- `a` — token set for message A
- `b` — token set for message B

**Returns:** similarity in `[0, 1]`
