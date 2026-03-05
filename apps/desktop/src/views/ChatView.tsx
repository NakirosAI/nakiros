import type { ResolvedLanguage, StoredWorkspace } from '@nakiros/shared';
import AgentPanel from '../components/AgentPanel';

interface Props {
  workspace: StoredWorkspace;
  lang: ResolvedLanguage;
}

export default function ChatView({ workspace, lang }: Props) {
  return (
    <AgentPanel
      workspaceId={workspace.id}
      repos={workspace.repos}
      workspacePath={workspace.workspacePath}
      persistentHistory
      lang={lang}
    />
  );
}
