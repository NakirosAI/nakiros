import type { StoredWorkspace } from '@nakiros/shared';
import AgentPanel from '../components/AgentPanel';

interface Props {
  workspace: StoredWorkspace;
}

export default function ChatView({ workspace }: Props) {
  return (
    <AgentPanel
      workspaceId={workspace.id}
      repos={workspace.repos}
      workspacePath={workspace.workspacePath}
      persistentHistory
    />
  );
}
