# artifact-review.ts

**Path:** `packages/shared/src/types/artifact-review.ts`

Types for the artifact-review flow: an agent proposes an edit to a workspace doc or backlog entity, the user reviews the diff, accepts or rejects. An `ArtifactContext` carried on a conversation tab constrains agent writes to one target.

## Exports

### `type ArtifactTarget`

Addressable target for a document/backlog edit proposed by an agent.

```ts
export type ArtifactTarget =
  | { kind: 'workspace_doc'; absolutePath: string }
  | {
      kind: 'backlog_epic' | 'backlog_story' | 'backlog_task' | 'backlog_sprint';
      workspaceId: string;
      id: string;
    };
```

### `type ArtifactChangeMode`

Whether a change is proposed as a diff for user review, or applied immediately (`yolo`).

```ts
export type ArtifactChangeMode = 'diff' | 'yolo';
```

### `type ArtifactReviewStatus`

Review lifecycle state of an artifact change session.

```ts
export type ArtifactReviewStatus = 'pending' | 'applied' | 'accepted' | 'rejected';
```

### `type ArtifactReviewSourceSurface`

Which UI surface triggered the artifact edit (used for analytics + routing).

```ts
export type ArtifactReviewSourceSurface = 'chat' | 'product' | 'backlog';
```

### `interface ArtifactContext`

Bundle carried on a conversation tab that constrains agent writes to a specific target + mode.

```ts
export interface ArtifactContext {
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  sourceSurface: ArtifactReviewSourceSurface;
  title?: string;
}
```

### `interface ArtifactChangeMetadata`

Lightweight metadata describing the target of a change before the full proposal is built.

```ts
export interface ArtifactChangeMetadata {
  target: ArtifactTarget;
  mode?: ArtifactChangeMode;
  title?: string;
}
```

### `interface ArtifactChangeProposal`

Complete change proposal ready to be reviewed — target + proposed content blob.

```ts
export interface ArtifactChangeProposal {
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  title: string;
  proposedContent: string;
}
```

### `interface ArtifactReviewSession`

Persisted review session tying a proposal to its baseline, proposed content, and status.

```ts
export interface ArtifactReviewSession {
  id: string;
  sourceSurface: ArtifactReviewSourceSurface;
  conversationId?: string | null;
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  baselineContent: string;
  proposedContent: string;
  status: ArtifactReviewStatus;
  title: string;
  triggerMessageId?: string | null;
}
```
