import { useState } from 'react';
import type { Project } from '@nakiros/shared';
import { useOutputStyles } from './output-styles/useOutputStyles';
import OutputStylesList from './output-styles/OutputStylesList';
import OutputStyleEditor from './output-styles/OutputStyleEditor';

interface OutputStylesScreenProps {
  project: Project;
}

type ViewState = { mode: 'list' } | { mode: 'edit'; styleName: string } | { mode: 'create' };

/**
 * Top-level orchestrator for the Output styles tab. Mirrors Rules /
 * Subagents screens: list view + editor; mutations flow through the
 * `useOutputStyles` hook so the list refreshes on save / delete and
 * the active-style banner stays accurate.
 */
export default function OutputStylesScreen({ project }: OutputStylesScreenProps) {
  const { styles, activeName, activeSource, loading, error, refresh, create, save, remove } =
    useOutputStyles(project.id);
  const [view, setView] = useState<ViewState>({ mode: 'list' });

  if (view.mode === 'list') {
    return (
      <OutputStylesList
        styles={styles}
        activeName={activeName}
        activeSource={activeSource}
        loading={loading}
        error={error}
        onRetry={refresh}
        onCreate={() => setView({ mode: 'create' })}
        onOpen={(styleName) => setView({ mode: 'edit', styleName })}
      />
    );
  }

  if (view.mode === 'create') {
    return (
      <OutputStyleEditor
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
    <OutputStyleEditor
      mode="edit"
      styleName={view.styleName}
      projectId={project.id}
      onClose={() => setView({ mode: 'list' })}
      save={save}
      create={create}
      remove={remove}
    />
  );
}
