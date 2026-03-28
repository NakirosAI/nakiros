import type {
  ArtifactChangeMode,
  ArtifactChangeProposal,
  StoredWorkspace,
} from '@nakiros/shared';
import ArtifactEditorChat from '../review/ArtifactEditorChat';

interface Props {
  doc: ScannedDoc;
  workspace: StoredWorkspace;
  mode: ArtifactChangeMode;
  onModeChange(mode: ArtifactChangeMode): void;
  onClose(): void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
}

export default function DocEditorChat({
  doc,
  workspace,
  mode,
  onModeChange,
  onClose,
  onArtifactChangeProposal,
}: Props) {
  return (
    <ArtifactEditorChat
      workspace={workspace}
      artifactContext={{
        target: { kind: 'workspace_doc', absolutePath: doc.absolutePath },
        mode,
        sourceSurface: 'product',
        title: doc.name,
      }}
      title={doc.name}
      subtitle={doc.relativePath}
      mode={mode}
      onModeChange={onModeChange}
      onClose={onClose}
      onArtifactChangeProposal={onArtifactChangeProposal}
    />
  );
}
