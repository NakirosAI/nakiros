import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileCog,
  RefreshCw,
  Save,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type {
  CodexConfigFile,
  CodexConfigMutationResult,
  CodexConfigRunMode,
  Project,
} from '@nakiros/shared';
import { launchCodexConfig, type OpenRunTabCallback } from '../lib/run-launcher';

interface Props {
  project: Project;
  onBack(): void;
  onOpenRunTab?: OpenRunTabCallback;
}

type SaveState = 'idle' | 'saving' | 'saved';

export default function CodexConfigScreen({ project, onBack, onOpenRunTab }: Props) {
  const { t } = useTranslation('codex-config');
  const [file, setFile] = useState<CodexConfigFile | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [launchingMode, setLaunchingMode] = useState<CodexConfigRunMode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveState('idle');
    try {
      const result = await window.nakiros.readCodexConfig(project.id);
      if (!result.ok) {
        setLoadError(result.message);
        setFile(null);
        return;
      }
      setFile(result.file);
      setContent(result.file.content);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = file !== null && content !== file.content;

  const handleSave = async () => {
    if (!file || !dirty || saveState === 'saving') return;
    setSaveState('saving');
    setSaveError(null);
    let result: CodexConfigMutationResult;
    try {
      result = await window.nakiros.saveCodexConfig(project.id, content, file.mtime);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : t('saveFailed'));
      setSaveState('idle');
      return;
    }

    if (!result.ok) {
      setSaveError(
        result.code === 'invalid-toml'
          ? t('invalidToml')
          : result.code === 'conflict'
            ? t('conflict')
            : result.message || t('saveFailed'),
      );
      setSaveState('idle');
      return;
    }

    setFile(result.file);
    setContent(result.file.content);
    setSaveState('saved');
  };

  const handleLaunch = async (mode: CodexConfigRunMode) => {
    if (!onOpenRunTab) return;
    setLaunchingMode(mode);
    setSaveError(null);
    try {
      await launchCodexConfig(
        { projectId: project.id, projectPath: project.projectPath, mode },
        onOpenRunTab,
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('runFailed'));
    } finally {
      setLaunchingMode(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas font-n-sans">
      <header className="border-b border-n-border-subtle px-7 py-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 rounded-n-xs text-[11.5px] text-n-muted transition-colors hover:text-n-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <FileCog size={19} strokeWidth={2} className="text-n-accent-strong" />
              <h1 className="m-0 font-n-mono text-[18px] font-medium text-n-fg">
                {t('title')}
              </h1>
            </div>
            <p className="mt-1.5 max-w-[70ch] text-[13px] leading-5 text-n-muted">
              {t('subtitle', { project: project.name })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleLaunch('audit')}
              disabled={launchingMode !== null}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-border-default bg-n-surface px-3 py-2 text-[12px] text-n-fg transition-colors hover:bg-n-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent disabled:opacity-50"
            >
              <Sparkles size={14} />
              {launchingMode === 'audit' ? t('launching') : t('audit')}
            </button>
            <button
              type="button"
              onClick={() => void handleLaunch(file?.exists ? 'fix' : 'create')}
              disabled={launchingMode !== null}
              className="inline-flex items-center gap-1.5 rounded-n-sm bg-n-accent px-3 py-2 text-[12px] font-medium text-n-canvas transition-colors hover:bg-n-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent disabled:opacity-50"
            >
              <Wrench size={14} />
              {launchingMode ? t('launching') : file?.exists ? t('fix') : t('createWithAgent')}
            </button>
            <span className="rounded-n-xs border border-n-accent-line bg-n-accent-soft px-2.5 py-1.5 font-n-mono text-[10.5px] text-n-accent-strong">
              {t('scope')}
            </span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 px-7 py-6" aria-live="polite">
          <div className="mx-auto max-w-5xl animate-pulse space-y-3">
            <div className="h-12 rounded-n-md bg-n-surface" />
            <div className="h-[360px] rounded-n-md bg-n-surface" />
          </div>
          <span className="sr-only">{t('loading')}</span>
        </div>
      ) : loadError || !file ? (
        <div className="grid flex-1 place-items-center px-7 py-6">
          <div className="max-w-lg rounded-n-md border border-n-critical/30 bg-n-critical-soft px-5 py-4 text-center">
            <AlertTriangle size={18} className="mx-auto text-n-critical" />
            <h2 className="mt-2 font-n-mono text-[13px] font-medium text-n-fg">
              {t('errorTitle')}
            </h2>
            {loadError && (
              <p className="mt-1 break-words text-[12px] leading-5 text-n-muted">{loadError}</p>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 text-[12px] text-n-fg transition-colors hover:bg-n-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent"
            >
              {t('retry')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-n-border-subtle pb-4">
              <div className="min-w-0">
                <div className="break-all font-n-mono text-[11.5px] text-n-fg">{file.path}</div>
                <p className="mt-1 max-w-[75ch] text-[11.5px] leading-5 text-n-muted">
                  {t('pathHelp')}
                </p>
              </div>
              <div className="flex items-center gap-2" aria-live="polite">
                {dirty && saveState !== 'saving' && (
                  <span className="font-n-mono text-[10.5px] text-n-watch">{t('unsaved')}</span>
                )}
                {!dirty && saveState === 'saved' && (
                  <span className="inline-flex items-center gap-1 font-n-mono text-[10.5px] text-n-healthy">
                    <Check size={12} />
                    {t('saved')}
                  </span>
                )}
              </div>
            </div>

            {!file.exists && (
              <div className="my-4 flex items-start gap-3 rounded-n-md border border-n-border-subtle bg-n-surface px-4 py-3.5">
                <FileCog size={16} className="mt-0.5 flex-none text-n-accent-strong" />
                <div>
                  <div className="text-[12.5px] font-medium text-n-fg">{t('emptyTitle')}</div>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-n-muted">{t('emptyHint')}</p>
                </div>
              </div>
            )}

            <div className="mt-4">
              <label htmlFor="codex-config-editor" className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editorLabel')}
              </label>
              <textarea
                id="codex-config-editor"
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setSaveState('idle');
                  setSaveError(null);
                }}
                placeholder={t('editorPlaceholder')}
                spellCheck={false}
                className="mt-2 min-h-[360px] w-full resize-y rounded-n-md border border-n-border-default bg-n-sunken px-4 py-3 font-n-mono text-[12px] leading-5 text-n-fg caret-n-accent outline-none transition-colors placeholder:text-n-faint focus:border-n-accent-line focus:ring-2 focus:ring-n-accent/25"
              />
            </div>

            {saveError && (
              <div className="mt-3 flex items-start gap-2 rounded-n-sm border border-n-critical/30 bg-n-critical-soft px-3 py-2.5 text-[11.5px] leading-5 text-n-critical" role="alert">
                <AlertTriangle size={14} className="mt-0.5 flex-none" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-n-border-subtle pt-4">
              <p className="m-0 text-[11px] leading-5 text-n-subtle">
                {!file.exists ? t('createHint') : t('pathHelp')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={saveState === 'saving'}
                  className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-border-default bg-n-surface px-3 py-2 text-[12px] text-n-fg transition-colors hover:bg-n-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={14} />
                  {t('reload')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saveState === 'saving'}
                  className="inline-flex items-center gap-1.5 rounded-n-sm bg-n-accent px-3 py-2 text-[12px] font-medium text-n-canvas transition-colors hover:bg-n-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent focus-visible:ring-offset-2 focus-visible:ring-offset-n-canvas disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={14} />
                  {saveState === 'saving' ? t('saving') : t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
