import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@nakiros/shared';
import { useOutputStyles } from './output-styles/useOutputStyles';
import OutputStylesList from './output-styles/OutputStylesList';
import OutputStyleEditor from './output-styles/OutputStyleEditor';
import OutputStyleDetailScreen from './output-styles/OutputStyleDetailScreen';
import CreateEntityModal from '../components/CreateEntityModal';
import { launchOutputStyles, type OpenRunTabCallback } from '../lib/run-launcher';

interface OutputStylesScreenProps {
  project: Project;
  onOpenRunTab?: OpenRunTabCallback;
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'edit'; styleName: string }
  | { mode: 'create' }
  | { mode: 'detail'; styleName: string };

/**
 * Top-level orchestrator for the Output styles tab. Mirrors Rules /
 * Subagents screens: list view + detail screen + editor; mutations flow
 * through the `useOutputStyles` hook so the list refreshes on save / delete
 * and the active-style banner stays accurate.
 *
 * Clicking a style card opens the full detail screen (3-tab Edit/Audit/Fix).
 * Clicking "Nouveau style" opens the shared CreateEntityModal: name input
 * + "Générer avec l'IA" — manual creation is intentionally not exposed here
 * (users who want to scaffold by hand can do so in their IDE).
 */
export default function OutputStylesScreen({ project, onOpenRunTab }: OutputStylesScreenProps) {
  const { t } = useTranslation('output-styles-runner');
  const { styles, activeName, activeSource, loading, error, refresh, create, save, remove } =
    useOutputStyles(project.id);
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
  function sanitizeStyleName(raw: string): string | null {
    let name = raw.trim();
    if (!name) return null;
    name = name
      .replace(/^\.\/+/, '')
      .replace(/^\/+/, '')
      .replace(/^\.claude\/output-styles\/+/, '')
      .replace(/^output-styles\/+/, '');
    if (!name) return null;
    if (!name.endsWith('.md')) name = `${name}.md`;
    return name;
  }

  async function handleCreateWithAi() {
    if (createNameInput == null || !onOpenRunTab) return;
    const name = sanitizeStyleName(createNameInput);
    if (!name) {
      setCreateError(t('modal.errorEmptyName'));
      return;
    }
    setLaunchingAi(true);
    setCreateError(null);
    try {
      await launchOutputStyles(
        {
          projectId: project.id,
          projectPath: project.projectPath,
          styleName: name,
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
        <OutputStylesList
          styles={styles}
          activeName={activeName}
          activeSource={activeSource}
          loading={loading}
          error={error}
          onRetry={refresh}
          onCreate={openCreateModal}
          onOpen={(styleName) => setView({ mode: 'detail', styleName })}
        />
      )}

      {view.mode === 'detail' && (
        <OutputStyleDetailScreen
          projectId={project.id}
          projectPath={project.projectPath}
          styleName={view.styleName}
          onBack={() => {
            // Refresh the listing on return — the detail screen may have
            // saved or deleted the style directly via IPC, bypassing the
            // hook's mutation methods.
            refresh();
            setView({ mode: 'list' });
          }}
          onOpenRunTab={onOpenRunTab}
        />
      )}

      {view.mode === 'create' && (
        <OutputStyleEditor
          mode="create"
          projectId={project.id}
          onClose={() => setView({ mode: 'list' })}
          save={save}
          create={create}
          remove={remove}
        />
      )}

      {view.mode === 'edit' && (
        <OutputStyleEditor
          mode="edit"
          styleName={view.styleName}
          projectId={project.id}
          onClose={() => setView({ mode: 'list' })}
          save={save}
          create={create}
          remove={remove}
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
