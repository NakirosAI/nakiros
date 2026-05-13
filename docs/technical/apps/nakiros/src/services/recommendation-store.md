# recommendation-store.ts

**Path:** `apps/nakiros/src/services/recommendation-store.ts`

Atomic filesystem store for friction-pattern recommendations. Persists patterns and reco cards under `~/.nakiros/recommendations/<projectId>/`. All writes go through a tmp-file + rename to ensure concurrent readers always see a coherent file.

## Layout on disk

```
~/.nakiros/recommendations/<projectId>/
  patterns.json                        — list of RecommendationPattern
  <patternId>/recos/<recId>.md         — raw markdown body (frontmatter included)
  <patternId>/recos/<recId>.json       — sidecar with status/appliedRunId/timestamps
  <patternId>/meta.json                — analyser run meta (optional)
  archive/<oldPatternId>/...           — recos for vanished patternIds (kept)
```

## Exports

### `PATTERNS_CACHE_VERSION`

```ts
export const PATTERNS_CACHE_VERSION = 1;
```

Schema version stored in `patterns.json`. Increment on breaking layout changes so stale files are ignored rather than misread.

---

### `projectDir(projectId)`

```ts
export function projectDir(projectId: string): string
```

Returns the absolute path to the per-project recommendations directory (`~/.nakiros/recommendations/<projectId>/`). Used by sibling modules that need to reference the same root.

---

### `readPatterns(projectId)`

```ts
export function readPatterns(projectId: string): RecommendationPattern[] | null
```

Returns the cached patterns list for `projectId`, or `null` when the file does not exist or carries an incompatible `version` value. Parse errors are swallowed and also return `null`.

---

### `writePatterns(projectId, patterns)`

```ts
export function writePatterns(projectId: string, patterns: RecommendationPattern[]): void
```

Replace the patterns file atomically. Before writing, compares the new id set against the previous one — patterns whose ids vanish are moved to `archive/<patternId>/` via `renameSync` so their reco cards are preserved. The file is stamped with `generatedAt` (ISO-8601) and `PATTERNS_CACHE_VERSION`.

---

### `updatePatternAnalysis(projectId, patternId, patch)`

```ts
export function updatePatternAnalysis(
  projectId: string,
  patternId: string,
  patch: Partial<RecommendationPattern['analysis']>,
): void
```

Patch the `analysis` block of a single pattern in-place inside `patterns.json` without touching any other field or other patterns. No-ops silently when the file or the pattern is missing.

---

### `writeRecoCard(projectId, card)`

```ts
export function writeRecoCard(projectId: string, card: RecoCard): void
```

Persist a reco card produced by the analyser. Writes both `<recId>.md` (markdown body) and `<recId>.json` (sidecar) atomically. The sidecar carries `status`, `appliedRunId`, and timestamps — the fields that mutate after creation.

---

### `listRecoCards(projectId, patternId)`

```ts
export function listRecoCards(projectId: string, patternId: string): RecoCard[]
```

Enumerate all reco cards under `<patternId>/recos/`, sorted by `createdAt` ascending. Returns `[]` when the directory does not exist. Skips any card whose files cannot be read or parsed.

---

### `readRecoCard(projectId, patternId, recId)`

```ts
export function readRecoCard(projectId: string, patternId: string, recId: string): RecoCard | null
```

Read a single reco card by joining its `.md` body and `.json` sidecar. Delegates parsing to `parseRecoCardFromDisk` (wired in Task 8). Returns `null` when either file is missing or cannot be read.

---

### `updateRecoStatus(projectId, patternId, recId, patch)`

```ts
export function updateRecoStatus(
  projectId: string,
  patternId: string,
  recId: string,
  patch: Partial<Pick<RecoCard, 'status' | 'appliedRunId' | 'editedAt'>>,
): void
```

Mutate a reco's sidecar to reflect a status change (apply / dismiss / un-apply). Reads the current sidecar, merges `patch`, and rewrites atomically. No-ops when the sidecar does not exist.

---

### `writeRecoBody(projectId, patternId, recId, body)`

```ts
export function writeRecoBody(projectId: string, patternId: string, recId: string, body: string): void
```

Overwrite the markdown body of a reco card and stamp `editedAt` in the sidecar. Used when the user edits the brief inline before applying. No-ops when the `.md` file does not exist.
