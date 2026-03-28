import { useCallback, useEffect, useState } from 'react';
import type {
  ArtifactChangeProposal,
  FileChangesReviewSession,
  OnboardingChatLaunchRequest,
  StoredWorkspace,
} from '@nakiros/shared';
import AgentPanel from '../components/AgentPanel';
import PreviewReviewPanel from '../components/PreviewReviewPanel';

interface Props {
  workspace: StoredWorkspace;
  isVisible?: boolean;
  onRunCompletionNoticeChange?: (workspaceId: string, pendingCount: number) => void;
  onPendingPreviewChange?: (workspaceId: string, hasPendingPreview: boolean) => void;
  openChatTarget?: OpenAgentRunChatPayload | null;
  launchChatRequest?: OnboardingChatLaunchRequest | null;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
  onFileChangesDetected?: (session: FileChangesReviewSession) => void;
}

export default function ChatView({
  workspace,
  isVisible = true,
  onRunCompletionNoticeChange,
  onPendingPreviewChange,
  openChatTarget,
  launchChatRequest,
  onArtifactChangeProposal,
  onFileChangesDetected,
}: Props) {
  const [pendingPreview, setPendingPreview] = useState<{ previewRoot: string; files: string[]; conversationId: string | null } | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const workspaceSlug = workspace.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';

  const refreshPreview = useCallback(() => {
    window.nakiros.previewCheck(workspaceSlug).then((result) => {
      setPendingPreview(result.exists ? { previewRoot: result.previewRoot, files: result.files, conversationId: result.conversationId } : null);
    }).catch(() => undefined);
  }, [workspaceSlug]);

  // Re-check preview whenever the workspace becomes visible or the active conversation changes
  useEffect(() => {
    if (!isVisible) return;
    refreshPreview();
  }, [isVisible, activeConversationId, refreshPreview]);

  const handleActiveConversationChange = useCallback((nakirosConversationId: string | null) => {
    setActiveConversationId(nakirosConversationId);
  }, []);

  useEffect(() => {
    onPendingPreviewChange?.(workspace.id, pendingPreview !== null);
  }, [workspace.id, pendingPreview, onPendingPreviewChange]);

  // Show preview when it exists AND:
  // - tabs still loading (activeConversationId null) → show optimistically
  // - preview has no conversationId (old format) → always show
  // - preview conversationId matches active conversation → show
  // Only hide if we know the active conversation is a different one
  const previewVisible = pendingPreview !== null && (
    activeConversationId === null
    || pendingPreview.conversationId === null
    || pendingPreview.conversationId === activeConversationId
  );

  async function handleApply() {
    if (!pendingPreview) return;
    await window.nakiros.previewApply(pendingPreview.previewRoot, workspaceSlug);
    setPendingPreview(null);
  }

  function handleDiscard() {
    if (!pendingPreview) return;
    window.nakiros.previewDiscard(pendingPreview.previewRoot).catch(() => undefined);
    setPendingPreview(null);
  }

  function handleNakirosAction(action: string) {
    if (action === 'preview:apply') { void handleApply(); return; }
    if (action === 'preview:discard') { handleDiscard(); return; }
  }

  return (
    <div className={`flex min-w-0 flex-1 overflow-hidden ${previewVisible ? 'flex-row' : 'flex-col'}`}>
      <div className={previewVisible ? 'w-[350px] shrink-0 overflow-hidden' : 'flex min-w-0 flex-1 flex-col overflow-hidden'}>
        <AgentPanel
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          repos={workspace.repos}
          workspacePath={workspace.workspacePath}
          isVisible={isVisible}
          onRunCompletionNoticeChange={onRunCompletionNoticeChange}
          openChatTarget={openChatTarget}
          launchChatRequest={launchChatRequest}
          onArtifactChangeProposal={onArtifactChangeProposal}
          onFileChangesDetected={onFileChangesDetected}
          onDone={refreshPreview}
          onNakirosAction={handleNakirosAction}
          onActiveConversationChange={handleActiveConversationChange}
          previewConversationId={pendingPreview?.conversationId ?? null}
          compactMode={previewVisible}
          persistentHistory
        />
      </div>
      {previewVisible && (
        <div className="min-w-0 flex-1 overflow-hidden">
          <PreviewReviewPanel
            previewRoot={pendingPreview!.previewRoot}
            workspaceSlug={workspaceSlug}
            files={pendingPreview!.files}
            onApply={handleApply}
            onDiscard={handleDiscard}
            onFileApplied={refreshPreview}
          />
        </div>
      )}
    </div>
  );
}
