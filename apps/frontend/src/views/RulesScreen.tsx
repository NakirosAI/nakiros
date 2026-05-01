import { useState } from 'react';
import type { Project } from '@nakiros/shared';
import { useRules } from './rules/useRules';
import RulesList from './rules/RulesList';
import RuleEditor from './rules/RuleEditor';

interface RulesScreenProps {
  project: Project;
}

type ViewState = { mode: 'list' } | { mode: 'edit'; ruleName: string } | { mode: 'create' };

/**
 * Top-level orchestrator for the Rules tab.
 *
 * Owns the navigation between the list view (cards of every rule) and the
 * editor view (create/edit form). Mutations flow through the `useRules`
 * hook so the list refreshes automatically on save / delete.
 */
export default function RulesScreen({ project }: RulesScreenProps) {
  const { rules, loading, error, refresh, create, save, remove } = useRules(project.id);
  const [view, setView] = useState<ViewState>({ mode: 'list' });

  if (view.mode === 'list') {
    return (
      <RulesList
        rules={rules}
        loading={loading}
        error={error}
        onRetry={refresh}
        onCreate={() => setView({ mode: 'create' })}
        onOpen={(ruleName) => setView({ mode: 'edit', ruleName })}
      />
    );
  }

  if (view.mode === 'create') {
    return (
      <RuleEditor
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
    <RuleEditor
      mode="edit"
      ruleName={view.ruleName}
      projectId={project.id}
      onClose={() => setView({ mode: 'list' })}
      save={save}
      create={create}
      remove={remove}
    />
  );
}
