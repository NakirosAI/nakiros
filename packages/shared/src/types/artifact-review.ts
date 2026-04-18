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

export type ArtifactChangeMode = 'diff' | 'yolo';
export type ArtifactReviewStatus = 'pending' | 'applied' | 'accepted' | 'rejected';
export type ArtifactReviewSourceSurface = 'chat' | 'product' | 'backlog';

export interface ArtifactContext {
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  sourceSurface: ArtifactReviewSourceSurface;
  title?: string;
}

export interface ArtifactChangeMetadata {
  target: ArtifactTarget;
  mode?: ArtifactChangeMode;
  title?: string;
}

export interface ArtifactChangeProposal {
  target: ArtifactTarget;
  mode: ArtifactChangeMode;
  title: string;
  proposedContent: string;
}

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
