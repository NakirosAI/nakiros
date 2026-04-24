/**
 * Addressable target for a document/backlog edit proposed by an agent.
 * - `workspace_doc` — a file on disk at `absolutePath`
 * - `backlog_*` — a typed entity (epic, story, task, sprint) in the workspace backlog by id
 */
export type ArtifactTarget =
  | {
      kind: 'workspace_doc';
      absolutePath: string;
    }
  | {
      kind: 'backlog_epic' | 'backlog_story' | 'backlog_task' | 'backlog_sprint';
      workspaceId: string;
      id: string;
    };

/** Whether a change is proposed as a diff for user review, or applied immediately (`yolo`). */
export type ArtifactChangeMode = 'diff' | 'yolo';

/** Review lifecycle state of an artifact change session. */
export type ArtifactReviewStatus = 'pending' | 'applied' | 'accepted' | 'rejected';

/** Which UI surface triggered the artifact edit (used for analytics + routing). */
export type ArtifactReviewSourceSurface = 'chat' | 'product' | 'backlog';

/**
 * Bundle carried on a conversation tab that constrains agent writes to a
 * specific target + mode. Used by the chat runtime to route diffs back to the
 * right review session.
 */
export interface ArtifactContext {
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  sourceSurface: ArtifactReviewSourceSurface;
  title?: string;
}

/** Lightweight metadata describing the target of a change before the full proposal is built. */
export interface ArtifactChangeMetadata {
  target: ArtifactTarget;
  mode?: ArtifactChangeMode;
  title?: string;
}

/** Complete change proposal ready to be reviewed — target + proposed content blob. */
export interface ArtifactChangeProposal {
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  title: string;
  proposedContent: string;
}

/** Persisted review session tying a proposal to its baseline, proposed content, and status. */
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
