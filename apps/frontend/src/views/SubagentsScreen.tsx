import { useState } from 'react';
import type { Project } from '@nakiros/shared';
import { useSubagents } from './subagents/useSubagents';
import SubagentsList from './subagents/SubagentsList';
import SubagentEditor from './subagents/SubagentEditor';
import SubagentDetailScreen from './subagents/SubagentDetailScreen';
import type { OpenRunTabCallback } from '../lib/run-launcher';

interface SubagentsScreenProps {
  project: Project;
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'edit'; agentName: string }
  | { mode: 'create' }
  | { mode: 'detail'; agentName: string };

/**
 * Top-level orchestrator for the Subagents tab. Mirrors the Rules screen:
 * owns the navigation between the list view, the detail screen, and the
 * legacy editor. Clicking a card opens the full `SubagentDetailScreen`
 * (3-tab: Edit / Audit / Fix). The legacy editor is only used for the
 * "Create" flow.
 */
export default function SubagentsScreen({ project, onOpenRunTab }: SubagentsScreenProps) {
  const { agents, loading, error, refresh, create, save, remove } = useSubagents(project.id);
  const [view, setView] = useState<ViewState>({ mode: 'list' });

  if (view.mode === 'list') {
    return (
      <SubagentsList
        agents={agents}
        loading={loading}
        error={error}
        onRetry={refresh}
        onCreate={() => setView({ mode: 'create' })}
        onOpen={(agentName) => {
          // The legacy `listClaudeAgents` IPC returns AgentEntry whose `name`
          // field has the `.md` extension stripped by the scanner. The new
          // `subagents:*` IPC expects the filename WITH the `.md` extension.
          // Normalise here so the detail screen always receives the right value.
          const normalized = agentName.endsWith('.md') ? agentName : `${agentName}.md`;
          setView({ mode: 'detail', agentName: normalized });
        }}
      />
    );
  }

  if (view.mode === 'detail') {
    return (
      <SubagentDetailScreen
        projectId={project.id}
        projectPath={project.projectPath}
        subagentName={view.agentName}
        onBack={() => setView({ mode: 'list' })}
        onOpenRunTab={onOpenRunTab}
      />
    );
  }

  if (view.mode === 'create') {
    return (
      <SubagentEditor
        mode="create"
        projectId={project.id}
        onClose={() => setView({ mode: 'list' })}
        save={save}
        create={create}
        remove={remove}
      />
    );
  }

  // Fallback: legacy edit mode (kept for backward compat)
  return (
    <SubagentEditor
      mode="edit"
      agentName={(view as { mode: 'edit'; agentName: string }).agentName}
      projectId={project.id}
      onClose={() => setView({ mode: 'list' })}
      save={save}
      create={create}
      remove={remove}
    />
  );
}
