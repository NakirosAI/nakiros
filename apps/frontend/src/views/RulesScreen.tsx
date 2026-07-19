import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfigurationProvider, Project } from '@nakiros/shared';
import { useRules } from './rules/useRules';
import RulesList from './rules/RulesList';
import RuleDetailScreen from './rules/RuleDetailScreen';
import CreateEntityModal from '../components/CreateEntityModal';
import { launchRules, type OpenRunTabCallback } from '../lib/run-launcher';

interface RulesScreenProps {
  project: Project;
  provider: ConfigurationProvider;
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'detail'; ruleName: string };

/**
 * Top-level orchestrator for the Rules tab.
 *
 * Owns the navigation between:
 * - **list** — card grid of every rule
 * - **detail** — per-rule 3-tab screen (Edit / Audit / Fix), calqued on ClaudeMdScreen
 * - **edit** — legacy inline form (kept for backward compat with RuleEditor)
 *
 * Clicking "Nouveau rule" opens the shared CreateEntityModal: name input
 * + "Générer avec l'IA" — manual creation is intentionally not exposed here
 * (users who want to scaffold by hand can do so in their IDE).
 */
export default function RulesScreen({ project, provider, onOpenRunTab }: RulesScreenProps) {
  const { t } = useTranslation('rules');
  const { rules, loading, error, refresh } = useRules(project.id, provider);
  const lifecycleRunTab = onOpenRunTab;
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  const [createNameInput, setCreateNameInput] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [launchingAi, setLaunchingAi] = useState(false);

  function openCreateModal() {
    setCreateNameInput('');
    setCreateError(null);
  }

  function closeCreateModal() {
    if (launchingAi) return;
    setCreateNameInput(null);
    setCreateError(null);
  }

  /** Sanitize the user-typed filename: strip prefixes, ensure `.md` suffix. */
  function sanitizeRuleName(raw: string): string | null {
    let name = raw.trim();
    if (!name) return null;
    name = name
      .replace(/^\.\/+/, '')
      .replace(/^\/+/, '')
      .replace(/^\.claude\/rules\/+/, '')
      .replace(/^rules\/+/, '');
    if (!name) return null;
    if (!name.endsWith('.md')) name = `${name}.md`;
    return name;
  }

  async function handleCreateWithAi() {
    if (createNameInput == null || !onOpenRunTab) return;
    const name = sanitizeRuleName(createNameInput);
    if (!name) {
      setCreateError(t('modal.errorEmptyName'));
      return;
    }
    setLaunchingAi(true);
    setCreateError(null);
    try {
      await launchRules(
        {
          projectId: project.id,
          projectPath: project.projectPath,
          provider,
          ruleName: name,
          mode: 'create',
        },
        onOpenRunTab,
      );
      setCreateNameInput(null);
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setLaunchingAi(false);
    }
  }

  return (
    <>
      {view.mode === 'list' && (
        <RulesList
          rules={rules}
          loading={loading}
          error={error}
          onRetry={refresh}
          onCreate={openCreateModal}
          onOpen={(ruleName) => setView({ mode: 'detail', ruleName })}
        />
      )}

      {view.mode === 'detail' && (
        <RuleDetailScreen
          projectId={project.id}
          projectPath={project.projectPath}
          provider={provider}
          ruleName={view.ruleName}
          onBack={() => {
            // Refresh the listing on return — the detail screen may have
            // saved or deleted the rule directly via IPC, bypassing the
            // hook's mutation methods.
            refresh();
            setView({ mode: 'list' });
          }}
          onOpenRunTab={lifecycleRunTab}
        />
      )}

      {createNameInput != null && (
        <CreateEntityModal
          value={createNameInput}
          error={createError}
          launchingAi={launchingAi}
          aiAvailable={Boolean(lifecycleRunTab)}
          onChange={(v) => {
            setCreateNameInput(v);
            if (createError) setCreateError(null);
          }}
          onCancel={closeCreateModal}
          onCreateWithAi={handleCreateWithAi}
          labels={{
            title: t('modal.title'),
            hint: t('modal.hint'),
            placeholder: t('modal.placeholder'),
            cancel: t('modal.cancel'),
            ai: t('modal.ai'),
            launching: t('modal.launching'),
            aiUnavailable: t('modal.aiUnavailable'),
          }}
        />
      )}
    </>
  );
}
