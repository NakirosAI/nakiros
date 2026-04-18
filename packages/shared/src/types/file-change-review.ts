export type FileChangeStatus = 'created' | 'modified' | 'deleted';

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

export interface SnapshotMeta {
  runId: string;
  workspaceSlug: string;
  takenAt: string;
  status: 'pending' | 'resolved';
}

export interface FileChangesReviewSession {
  runId: string;
  workspaceSlug: string;
  changes: FileChange[];
}
