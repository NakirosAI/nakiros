import { useState } from 'react';
import type { Project } from '@nakiros/shared';
import { useSubagents } from './subagents/useSubagents';
import SubagentsList from './subagents/SubagentsList';
import SubagentEditor from './subagents/SubagentEditor';

interface SubagentsScreenProps {
  project: Project;
}

type ViewState = { mode: 'list' } | { mode: 'edit'; agentName: string } | { mode: 'create' };

/**
 * Top-level orchestrator for the Subagents tab. Mirrors the Rules screen:
 * owns the navigation between the list view and the editor view, threads
 * mutations through the `useSubagents` hook so the list refreshes on
 * save / delete.
 */
export default function SubagentsScreen({ project }: SubagentsScreenProps) {
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
        onOpen={(agentName) => setView({ mode: 'edit', agentName })}
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

  return (
    <SubagentEditor
      mode="edit"
      agentName={view.agentName}
      projectId={project.id}
      onClose={() => setView({ mode: 'list' })}
      save={save}
      create={create}
      remove={remove}
    />
  );
}
