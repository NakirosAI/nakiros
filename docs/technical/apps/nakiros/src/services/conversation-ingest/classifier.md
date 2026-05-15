# classifier

**Path:** `apps/nakiros/src/services/conversation-ingest/classifier.ts`

Lazy-load helpers around the persisted V1.1 friction classifier output. The classifier itself runs through the streaming `classify-convo-runner`. This module owns read/write of the resulting `ConversationDigest` JSON files under `~/.nakiros/ingest/projects/<encoded>/digests/<sessionId>.json`.

## Exports

### `loadDigest`

```ts
export function loadDigest(projectPath: string, sessionId: string): ConversationDigest | null
```

Lazy cache read — returns the persisted digest, or `null` when none exists.

### `persistDigest`

```ts
export function persistDigest(digest: ConversationDigest): void
```

Persist a digest to disk under the per-project digests folder. Ensures the `digests/` directory exists before writing.

### `listDigestsForProject`

```ts
export function listDigestsForProject(projectPath: string): ConversationDigestSummary[]
```

List every digest stored for a project. Returns the compact summary the UI needs to render at-a-glance status without loading every full digest.
