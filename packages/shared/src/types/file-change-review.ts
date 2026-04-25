/** Status of a file inside a {@link FileChangesReviewSession}. */
export type FileChangeStatus = 'created' | 'modified' | 'deleted';

/** Single file mutation surfaced to the user for review (created / modified / deleted). */
export interface FileChange {
  /** Path relative to the workspace context dir, e.g. "features/backlog/feature.md" */
  relativePath: string;
  absolutePath: string;
  status: FileChangeStatus;
  /** null for created files */
  before: string | null;
  /** null for deleted files */
  after: string | null;
}

/** Metadata captured when a runner takes a workspace snapshot for later review. */
export interface SnapshotMeta {
  runId: string;
  workspaceSlug: string;
  takenAt: string;
  status: 'pending' | 'resolved';
}

/** Aggregate of file changes produced by a run; the user must approve or reject the batch. */
export interface FileChangesReviewSession {
  runId: string;
  workspaceSlug: string;
  changes: FileChange[];
}
