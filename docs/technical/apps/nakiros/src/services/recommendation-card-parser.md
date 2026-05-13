# recommendation-card-parser

**Path:** `apps/nakiros/src/services/recommendation-card-parser.ts`

Parser and validator for recommendation cards produced by the `recommendation-analyze` runner. Cards are markdown files with YAML frontmatter and body sections (`## Why`, `## Brief`, `## Acceptance criteria`). Provides two entry points: `parseRecoCardFromMarkdown` for new cards (with optional inventory cross-check and `fix`→`create` downgrade), and `parseRecoCardFromDisk` for re-hydrating persisted cards without re-validating.

## Exports

### `ParseResult`

```ts
export type ParseResult = ParseOk | ParseError;
```

Discriminated union returned by `parseRecoCardFromMarkdown`. Inspect `result.ok` to distinguish success from failure. On success, `result.card` is the validated `RecoCard` and `result.downgraded` is `true` when `action: fix` was silently downgraded to `action: create` because the target was absent from the inventory.

---

### `parseRecoCardFromMarkdown`

```ts
export function parseRecoCardFromMarkdown(
  rawMarkdown: string,
  patternId: string,
  inventory?: ProjectInventory,
): ParseResult
```

Parse a markdown card file. Validates frontmatter against the spec schema. Optionally cross-checks `target` against a `ProjectInventory` to downgrade `fix` → `create` when the target doesn't exist.

The downgrade behaviour is critical: when the agent claims `action: fix` but the target doesn't exist in inventory, a usable card is still returned (downgraded to `create` with `target: 'new'`) rather than skipping. Callers can detect this via `result.downgraded === true`.

**Parameters:**
- `rawMarkdown` — Full markdown content including YAML frontmatter.
- `patternId` — Expected `patternId` value — validated against the frontmatter field.
- `inventory` — Optional inventory for cross-checking `action: fix` targets.

**Returns:** A `ParseResult` discriminated union — `ok: true` on success. On failure, `result.reason` is a short string propagated to `meta.json.skippedCards[].reason` in Task 10.

---

### `parseRecoCardFromDisk`

```ts
export function parseRecoCardFromDisk(
  rawMarkdown: string,
  sidecar: {
    recId: string;
    patternId: string;
    status: RecoCard['status'];
    appliedRunId?: string;
    createdAt: string;
    editedAt?: string;
  },
): RecoCard | null
```

Re-hydrate a card from disk by combining a stored markdown body and its sidecar JSON. Skips the inventory cross-check (the card was already validated when first persisted). Used by `recommendation-store.ts` to reconstruct cards on read.

**Parameters:**
- `rawMarkdown` — Markdown content read from `<recId>.md`.
- `sidecar` — Sidecar metadata read from `<recId>.json`.

**Returns:** A fully hydrated `RecoCard`, or `null` when the markdown cannot be re-parsed (e.g. file was manually corrupted).
