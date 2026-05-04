import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@nakiros/shared';
import { useSubagents } from './subagents/useSubagents';
import SubagentsList from './subagents/SubagentsList';
import SubagentDetailScreen from './subagents/SubagentDetailScreen';
import CreateEntityModal from '../components/CreateEntityModal';
import { launchSubagents, type OpenRunTabCallback } from '../lib/run-launcher';

interface SubagentsScreenProps {
  project: Project;
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'detail'; agentName: string };

/**
 * Top-level orchestrator for the Subagents tab. Mirrors the Rules screen:
 * owns the navigation between the list view, the detail screen, and the
 * shared CreateEntityModal. Clicking a card opens the full
 * `SubagentDetailScreen` (3-tab: Edit / Audit / Fix). Clicking
 * "Nouveau subagent" opens the modal: name input + AI generation.
 *
 * Manual creation is intentionally not exposed — users who want to
 * scaffold by hand can do so in their IDE.
 */
export default function SubagentsScreen({ project, onOpenRunTab }: SubagentsScreenProps) {
  const { t } = useTranslation('subagents');
  const { agents, loading, error, refresh } = useSubagents(project.id);
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
  function sanitizeAgentName(raw: string): string | null {
    let name = raw.trim();
    if (!name) return null;
    name = name
      .replace(/^\.\/+/, '')
      .replace(/^\/+/, '')
      .replace(/^\.claude\/agents\/+/, '')
      .replace(/^agents\/+/, '');
    if (!name) return null;
    if (!name.endsWith('.md')) name = `${name}.md`;
    return name;
  }

  async function handleCreateWithAi() {
    if (createNameInput == null || !onOpenRunTab) return;
    const name = sanitizeAgentName(createNameInput);
    if (!name) {
      setCreateError(t('modal.errorEmptyName'));
      return;
    }
    setLaunchingAi(true);
    setCreateError(null);
    try {
      await launchSubagents(
        {
          projectId: project.id,
          projectPath: project.projectPath,
          subagentName: name,
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
        <SubagentsList
          agents={agents}
          loading={loading}
          error={error}
          onRetry={refresh}
          onCreate={openCreateModal}
          onOpen={(agentName) => {
            // The legacy `listClaudeAgents` IPC returns AgentEntry whose `name`
            // field has the `.md` extension stripped by the scanner. The new
            // `subagents:*` IPC expects the filename WITH the `.md` extension.
            const normalized = agentName.endsWith('.md') ? agentName : `${agentName}.md`;
            setView({ mode: 'detail', agentName: normalized });
          }}
        />
      )}

      {view.mode === 'detail' && (
        <SubagentDetailScreen
          projectId={project.id}
          projectPath={project.projectPath}
          subagentName={view.agentName}
          onBack={() => {
            // Refresh the listing on return — the detail screen may have
            // saved or deleted the subagent directly via IPC, bypassing the
            // hook's mutation methods.
            refresh();
            setView({ mode: 'list' });
          }}
          onOpenRunTab={onOpenRunTab}
        />
      )}

      {createNameInput != null && (
        <CreateEntityModal
          value={createNameInput}
          error={createError}
          launchingAi={launchingAi}
          aiAvailable={Boolean(onOpenRunTab)}
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
