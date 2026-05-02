import { useState } from 'react';
import type { Project } from '@nakiros/shared';
import { useMcp } from './mcp/useMcp';
import McpList from './mcp/McpList';
import McpEditor from './mcp/McpEditor';

interface McpScreenProps {
  project: Project;
}

type ViewState = { mode: 'list' } | { mode: 'edit'; serverName: string } | { mode: 'create' };

/** Top-level orchestrator for the MCP tab. */
export default function McpScreen({ project }: McpScreenProps) {
  const { info, loading, error, refresh, create, save, remove } = useMcp(project.id);
  const [view, setView] = useState<ViewState>({ mode: 'list' });

  if (view.mode === 'list') {
    return (
      <McpList
        items={info?.items ?? []}
        loading={loading}
        error={error}
        parseError={info?.parseError}
        fileExists={info?.present ?? false}
        filePath={info?.path ?? ''}
        onRetry={refresh}
        onCreate={() => setView({ mode: 'create' })}
        onOpen={(name) => setView({ mode: 'edit', serverName: name })}
      />
    );
  }

  if (view.mode === 'create') {
    return (
      <McpEditor
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
    <McpEditor
      mode="edit"
      serverName={view.serverName}
      projectId={project.id}
      onClose={() => setView({ mode: 'list' })}
      save={save}
      create={create}
      remove={remove}
    />
  );
}
