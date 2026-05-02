import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConversationIngestHookDiff,
  ConversationIngestProgressEvent,
  ConversationIngestProject,
  ConversationIngestStatus,
} from '@nakiros/shared';

/**
 * Settings panel for the opt-in conversation-ingest pipeline. The user
 * toggles the global Stop hook from here; before installation we surface a
 * full diff of `~/.claude/settings.json` so there are no hidden mutations.
 *
 * Once enabled, the panel shows a per-project list (V2 layout) so the user
 * sees exactly which codebases have been indexed. Synthetic projects
 * (sandboxes / Nakiros-internal runs) are hidden by default behind a toggle.
 *
 * Conventions: native `<button>` + n-* tokens (no `components/ui/Button`),
 * Tailwind-first, i18n via the `conversation-ingest` namespace.
 */

const HOOK_DIFF_INITIAL: ConversationIngestHookDiff = {
  settingsPath: '',
  exists: false,
  current: '',
  next: '',
  hookScriptPath: '',
};

function formatTimestamp(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function progressLine(
  event: ConversationIngestProgressEvent | null,
  t: ReturnType<typeof useTranslation<'conversation-ingest'>>['t'],
): string | null {
  if (!event || event.phase === 'idle') return null;
  if (event.phase === 'error') return t('progressError', { error: event.error ?? '' });
  if (event.phase === 'scanning') return t('progressScanning');
  if (event.phase === 'done') return t('progressDone', { total: event.total });
  if (event.currentSessionId) {
    return t('progressIngesting', { current: event.currentSessionId });
  }
  return null;
}

export default function ConversationIngestPanel() {
  const { t } = useTranslation('conversation-ingest');
  const [status, setStatus] = useState<ConversationIngestStatus | null>(null);
  const [projects, setProjects] = useState<ConversationIngestProject[]>([]);
  const [diff, setDiff] = useState<ConversationIngestHookDiff>(HOOK_DIFF_INITIAL);
  const [diffOpen, setDiffOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSynthetic, setShowSynthetic] = useState(false);
  const [progress, setProgress] = useState<ConversationIngestProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [nextStatus, nextProjects] = await Promise.all([
        window.nakiros.getConversationIngestStatus(),
        window.nakiros.listConversationIngestProjects(),
      ]);
      setStatus(nextStatus);
      setProjects(nextProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    const unsubscribe = window.nakiros.onConversationIngestProgress((event) => {
      setProgress(event);
      if (event.phase === 'done') void refreshAll();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshAll]);

  const visibleProjects = useMemo(
    () => (showSynthetic ? projects : projects.filter((p) => p.kind === 'user')),
    [projects, showSynthetic],
  );

  const syntheticCount = useMemo(
    () => projects.filter((p) => p.kind === 'synthetic').length,
    [projects],
  );

  const openDiff = async () => {
    setError(null);
    try {
      const next = await window.nakiros.previewConversationIngestHookDiff();
      setDiff(next);
      setDiffOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const confirmEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.nakiros.enableConversationIngest();
      if (!result.ok) {
        setError(t('errorEnableFailed', { message: result.message }));
      } else {
        setStatus(result.status);
        setDiffOpen(false);
        void refreshAll();
      }
    } catch (err) {
      setError(t('errorEnableFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.nakiros.disableConversationIngest();
      if (!result.ok) {
        setError(t('errorDisableFailed', { message: result.message }));
      } else {
        setStatus(result.status);
      }
    } catch (err) {
      setError(t('errorDisableFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.nakiros.runNowConversationIngest();
      if (!result.ok) {
        setError(t('errorScanFailed', { message: result.message }));
      } else {
        setStatus(result.status);
        void refreshAll();
      }
    } catch (err) {
      setError(t('errorScanFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm(t('purgeConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.nakiros.purgeConversationIngest();
      if (!result.ok) {
        setError(t('errorPurgeFailed', { message: result.message }));
      } else {
        setStatus(result.status);
        setProjects([]);
      }
    } catch (err) {
      setError(t('errorPurgeFailed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const enabled = status?.enabled === true;
  const hookOnly = status?.hookInstalled === true && status?.enabled === false;
  const stateLabel = enabled
    ? t('statusEnabled')
    : hookOnly
    ? t('statusPartial')
    : t('statusDisabled');
  const stateDot = enabled
    ? 'bg-n-accent-strong'
    : hookOnly
    ? 'bg-amber-500'
    : 'bg-n-border-default';
  const progressText = progressLine(progress, t);

  return (
    <div className="mb-2 rounded-n-lg border border-n-border-subtle bg-n-surface px-4 py-3 shadow-n-card">
      <div className="flex items-start gap-3">
        <span className="flex-1 text-[13px] text-n-fg">
          <span className="font-medium">{t('title')}</span>
          <span className="mt-1 block text-[12px] text-n-muted">{t('subtitle')}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-border-subtle bg-n-raised px-2 py-1 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-muted">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateDot}`} />
          {stateLabel}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t('totalProjectsLabel')} value={String(status?.totalProjects ?? 0)} mono />
        <Stat label={t('totalTurnsLabel')} value={String(status?.totalTurns ?? 0)} mono />
        <Stat
          label={t('lastIngestLabel')}
          value={formatTimestamp(status?.lastIngestAt ?? null, t('neverLabel'))}
        />
        <Stat label={t('queueLengthLabel')} value={String(status?.queueLength ?? 0)} mono />
      </div>

      {progressText && (
        <div className="mt-3 rounded-n-sm border border-n-border-subtle bg-n-raised px-3 py-1.5 font-n-mono text-[11px] text-n-muted">
          {progressText}
          {progress && progress.total > 0 && progress.phase !== 'done' && (
            <span className="ml-2 text-n-subtle">
              ({progress.processed}/{progress.total})
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-n-sm border border-red-700 bg-red-950 px-3 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!enabled && (
          <button
            type="button"
            onClick={() => void openDiff()}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent-strong transition-colors hover:bg-n-accent-line disabled:opacity-50"
          >
            {t('enableButton')}
          </button>
        )}
        {(enabled || hookOnly) && (
          <button
            type="button"
            onClick={() => void handleDisable()}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-border-default bg-n-raised px-2.5 font-n-mono text-[11.5px] text-n-fg transition-colors hover:bg-n-canvas disabled:opacity-50"
          >
            {t('disableButton')}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleRunNow()}
          disabled={busy || !enabled}
          className="inline-flex h-7 items-center rounded-n-sm border border-n-border-subtle bg-transparent px-2.5 font-n-mono text-[11.5px] text-n-muted transition-colors hover:bg-n-raised hover:text-n-fg disabled:opacity-40"
        >
          {t('runNowButton')}
        </button>
        {projects.length > 0 && (
          <button
            type="button"
            onClick={() => void handlePurge()}
            disabled={busy}
            className="ml-auto inline-flex h-7 items-center rounded-n-sm border border-red-900 bg-transparent px-2.5 font-n-mono text-[11.5px] text-red-300 transition-colors hover:bg-red-950 disabled:opacity-50"
          >
            {t('purgeButton')}
          </button>
        )}
      </div>

      <p className="mt-3 mb-0 text-[11.5px] text-n-subtle">
        {t('infoLocalOnly')} <span className="text-n-muted">{t('infoFutureUse')}</span>
      </p>

      <ProjectsSection
        projects={visibleProjects}
        showSynthetic={showSynthetic}
        onToggleSynthetic={() => setShowSynthetic((v) => !v)}
        syntheticCount={syntheticCount}
      />

      {diffOpen && (
        <DiffModal
          diff={diff}
          busy={busy}
          onCancel={() => setDiffOpen(false)}
          onConfirm={() => void confirmEnable()}
        />
      )}
    </div>
  );
}

interface ProjectsSectionProps {
  projects: ConversationIngestProject[];
  showSynthetic: boolean;
  onToggleSynthetic: () => void;
  syntheticCount: number;
}

function ProjectsSection({
  projects,
  showSynthetic,
  onToggleSynthetic,
  syntheticCount,
}: ProjectsSectionProps) {
  const { t } = useTranslation('conversation-ingest');
  return (
    <div className="mt-4 border-t border-n-border-subtle pt-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          {t('projectsHeading')}
        </div>
        {syntheticCount > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-n-muted">
            <input
              type="checkbox"
              checked={showSynthetic}
              onChange={onToggleSynthetic}
              className="h-3 w-3 cursor-pointer accent-n-accent-strong"
            />
            <span>
              {t('showSyntheticToggle')} <span className="text-n-subtle">({syntheticCount})</span>
            </span>
          </label>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="mt-2 rounded-n-sm border border-n-border-subtle bg-n-raised px-3 py-3 text-[12px] text-n-muted">
          {t('projectsEmpty')}
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {projects.map((project) => (
            <ProjectRow key={project.encodedDir} project={project} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: ConversationIngestProject }) {
  const { t } = useTranslation('conversation-ingest');
  const isSynthetic = project.kind === 'synthetic';
  const dotClass = isSynthetic ? 'bg-amber-500' : 'bg-n-accent-strong';
  const kindLabel = isSynthetic ? t('kindSynthetic') : t('kindUser');
  return (
    <li className="rounded-n-sm border border-n-border-subtle bg-n-raised px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            <span className="truncate text-[13px] text-n-fg">{project.displayName}</span>
            <span className="font-n-mono text-[9.5px] uppercase tracking-[1px] text-n-subtle">
              {kindLabel}
            </span>
          </div>
          <div className="mt-0.5 break-all font-n-mono text-[10.5px] text-n-subtle">
            {project.projectPath}
          </div>
        </div>
        <div className="shrink-0 text-right font-n-mono text-[11px] text-n-muted">
          <div>{t('projectSessionsLabel', { count: project.totalSessions })}</div>
          <div className="text-n-subtle">{t('projectTurnsLabel', { count: project.totalTurns })}</div>
        </div>
      </div>
      <div className="mt-1.5 font-n-mono text-[10px] text-n-subtle">
        {formatTimestamp(project.lastTurnAt, '—')}
      </div>
    </li>
  );
}

interface DiffModalProps {
  diff: ConversationIngestHookDiff;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DiffModal({ diff, busy, onCancel, onConfirm }: DiffModalProps) {
  const { t } = useTranslation('conversation-ingest');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[860px] flex-col overflow-hidden rounded-n-lg border border-n-border-default bg-n-canvas shadow-n-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-n-border-subtle bg-n-surface px-5 py-3">
          <h2 className="m-0 text-[14.5px] font-medium text-n-fg">{t('diffTitle')}</h2>
          <p className="mt-1 mb-0 text-[12px] text-n-muted">{t('diffDescription')}</p>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">
          <Field label={t('diffPathLabel')} value={diff.settingsPath} />
          <Field label={t('diffScriptLabel')} value={diff.hookScriptPath} />

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DiffPane
              title={t('diffBeforeLabel')}
              content={diff.exists ? diff.current : t('diffNotExistsLabel')}
              tone="neutral"
            />
            <DiffPane title={t('diffAfterLabel')} content={diff.next} tone="accent" />
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-n-border-subtle bg-n-surface px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-border-default bg-n-raised px-3 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas disabled:opacity-50"
          >
            {t('diffCancelButton')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-7 items-center rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-line disabled:opacity-50"
          >
            {t('diffConfirmButton')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-32 shrink-0 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {label}
      </span>
      <span className="flex-1 break-all font-n-mono text-[11.5px] text-n-muted">{value}</span>
    </div>
  );
}

function DiffPane({
  title,
  content,
  tone,
}: {
  title: string;
  content: string;
  tone: 'neutral' | 'accent';
}) {
  const border = tone === 'accent' ? 'border-n-accent-line' : 'border-n-border-subtle';
  return (
    <div className={`overflow-hidden rounded-n-sm border ${border} bg-n-raised`}>
      <div className="border-b border-n-border-subtle bg-n-surface px-3 py-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {title}
      </div>
      <pre className="m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all px-3 py-3 font-n-mono text-[11.5px] leading-[1.55] text-n-muted">
        {content}
      </pre>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-n-sm border border-n-border-subtle bg-n-raised px-3 py-2">
      <div className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">{label}</div>
      <div className={`mt-1 ${mono ? 'font-n-mono ' : ''}text-[13px] text-n-fg`}>{value}</div>
    </div>
  );
}
