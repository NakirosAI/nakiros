import type { StoredWorkspace } from '@nakiros/shared';
import AgentPanel from '../components/AgentPanel';

interface Props {
  workspace: StoredWorkspace;
  isVisible?: boolean;
  onRunCompletionNoticeChange?: (workspaceId: string, pendingCount: number) => void;
  openChatTarget?: OpenAgentRunChatPayload | null;
}

export default function ChatView({
  workspace,
  isVisible = true,
  onRunCompletionNoticeChange,
  openChatTarget,
}: Props) {
  return (
    <AgentPanel
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      repos={workspace.repos}
      workspacePath={workspace.workspacePath}
      isVisible={isVisible}
      onRunCompletionNoticeChange={onRunCompletionNoticeChange}
      openChatTarget={openChatTarget}
      persistentHistory
    />
  );
}
