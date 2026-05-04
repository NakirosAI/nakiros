import { useState } from 'react';
import type { Project } from '@nakiros/shared';
import { useRules } from './rules/useRules';
import RulesList from './rules/RulesList';
import RuleEditor from './rules/RuleEditor';
import RuleDetailScreen from './rules/RuleDetailScreen';
import type { OpenRunTabCallback } from '../lib/run-launcher';

interface RulesScreenProps {
  project: Project;
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'edit'; ruleName: string }
  | { mode: 'create' }
  | { mode: 'detail'; ruleName: string };

/**
 * Top-level orchestrator for the Rules tab.
 *
 * Owns the navigation between:
 * - **list** — card grid of every rule
 * - **detail** — per-rule 3-tab screen (Edit / Audit / Fix), calqued on ClaudeMdScreen
 * - **create** — inline form for creating a new rule
 * - **edit** — legacy inline form (kept for backward compat with RuleEditor)
 *
 * Clicking a rule card now opens the full detail screen (not the old inline editor).
 * The legacy editor is only used for the "Create" flow for now.
 */
export default function RulesScreen({ project, onOpenRunTab }: RulesScreenProps) {
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
        onOpen={(ruleName) => setView({ mode: 'detail', ruleName })}
      />
    );
  }

  if (view.mode === 'detail') {
    return (
      <RuleDetailScreen
        projectId={project.id}
        projectPath={project.projectPath}
        ruleName={view.ruleName}
        onBack={() => setView({ mode: 'list' })}
        onOpenRunTab={onOpenRunTab}
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

  // Fallback: legacy edit mode (kept for backward compat)
  return (
    <RuleEditor
      mode="edit"
      ruleName={(view as { mode: 'edit'; ruleName: string }).ruleName}
      projectId={project.id}
      onClose={() => setView({ mode: 'list' })}
      save={save}
      create={create}
      remove={remove}
    />
  );
}
