# file-change-review.ts

**Path:** `packages/shared/src/types/file-change-review.ts`

Types used by the file-changes review UI: a review session groups a list of file mutations produced by a runner and waits for user approval before they are applied for real.

## Exports

### `type FileChangeStatus`

Status of a file inside a `FileChangesReviewSession`.

```ts
export type FileChangeStatus = 'created' | 'modified' | 'deleted';
```

### `interface FileChange`

Single file mutation surfaced to the user for review (created / modified / deleted).

```ts
export interface FileChange {
  /** Path relative to the workspace context dir. */
  relativePath: string;
  absolutePath: string;
  status: FileChangeStatus;
  /** null for created files */
  before: string | null;
  /** null for deleted files */
  after: string | null;
}
```

### `interface SnapshotMeta`

Metadata captured when a runner takes a workspace snapshot for later review.

```ts
export interface SnapshotMeta {
  runId: string;
  workspaceSlug: string;
  takenAt: string;
  status: 'pending' | 'resolved';
}
```

### `interface FileChangesReviewSession`

Aggregate of file changes produced by a run; the user must approve or reject the batch.

```ts
export interface FileChangesReviewSession {
  runId: string;
  workspaceSlug: string;
  changes: FileChange[];
}
```
