import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ConfigurationProvider, HooksAuditHistoryEntry, HooksRunMode, Project } from '@nakiros/shared';
import AuditHistoryPicker from '../components/skill/AuditHistoryPicker';
import type { GenericAuditEntry } from '../components/skill/AuditHistoryPicker';
import AuditMarkdownViewer from '../components/skill/AuditMarkdownViewer';
import ScoreRing from '../components/viz/ScoreRing';
import { launchHooks, type OpenRunTabCallback } from '../lib/run-launcher';
import { useHooksFile } from './hooks/useHooksFile';
import HooksFormEditor from './hooks/HooksFormEditor';

interface HooksScreenProps {
  project: Project;
  provider: ConfigurationProvider;
  onBack?(): void;
  onOpenRunTab?: OpenRunTabCallback;
}

type ScreenTab = 'edit' | 'audit' | 'fix';
type EditMode = 'form' | 'json';

interface AuditScore {
  value: number;
  max: number;
}

/**
 * Singleton Hooks screen — mirrors `ClaudeMdScreen` exactly.
 *
 * Displays and edits the `hooks` block of `.claude/settings.json` as raw
 * JSON with live validation. Three tabs:
 *
 * 1. **Edit** — `<textarea>` JSON editor + live validation badge + sidebar metrics.
 * 2. **Audit** — `AuditHistoryPicker` + `AuditMarkdownViewer` + `ScoreRing`.
 * 3. **Fix** — Simple CTA landing.
 *
 * Uses `hooks:read` / `hooks:save` / `hooks:listAudits` / `hooks:readAudit`
 * IPC — distinct from the Module-6 hooks editor (`claudeHooks:read`).
 */
export default function HooksScreen({ project, provider, onBack, onOpenRunTab }: HooksScreenProps) {
  const { t } = useTranslation('hooks-runner');
  const lifecycleRunTab = onOpenRunTab;

  // Audit list ─────────────────────────────────────────────────────────────
  const [audits, setAudits] = useState<HooksAuditHistoryEntry[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<GenericAuditEntry | null>(null);
  const [auditContent, setAuditContent] = useState<string | null>(null);
  const [auditContentError, setAuditContentError] = useState<string | null>(null);

  const loadAudits = useCallback(async () => {
    try {
      const result = await window.nakiros.listHooksAudits(project.id, provider);
      setAudits(result ?? []);
      if (result && result.length > 0 && !selectedAudit) {
        setSelectedAudit(result[0] ?? null);
      }
    } catch {
      setAudits([]);
    }
  }, [project.id, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const { file, loading, error, refresh, save } = useHooksFile(
    project.id,
    provider,
    project.projectPath,
    loadAudits,
  );

  useEffect(() => {
    void loadAudits();
  }, [loadAudits]);

  // Read audit report when selection changes ───────────────────────────────
  useEffect(() => {
    if (!selectedAudit) {
      setAuditContent(null);
      return;
    }
    let cancelled = false;
    setAuditContent(null);
    setAuditContentError(null);
    window.nakiros
      .readHooksAudit(selectedAudit.path)
      .then((md) => {
        if (cancelled) return;
        setAuditContent(md ?? '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAuditContentError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAudit]);

  const [tab, setTab] = useState<ScreenTab>('edit');
  const [editMode, setEditMode] = useState<EditMode>('form');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [launchingMode, setLaunchingMode] = useState<HooksRunMode | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  // Body sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    setBody(file.content);
    setErrorBanner(null);
  }, [file]);

  const dirty = useMemo(() => {
    if (!file) return false;
    return body !== file.content;
  }, [file, body]);

  // JSON validation ────────────────────────────────────────────────────────
  const jsonValidation = useMemo((): { valid: boolean; message?: string } => {
    if (body.trim() === '' || body.trim() === '{}') return { valid: true };
    try {
      JSON.parse(body);
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }, [body]);

  // Actions ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!file || !jsonValidation.valid) return;
    setErrorBanner(null);
    setSubmitting(true);
    const result = await save(body, file.mtime);
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({
        code: result.code ?? 'unknown',
        message: result.message ?? t('errors.writeFailed'),
        showReload: result.code === 'conflict',
      });
    }
  };

  const handleReset = () => {
    if (!file) return;
    setBody(file.content);
    setErrorBanner(null);
  };

  const handleLaunchRun = async (mode: HooksRunMode) => {
    if (!lifecycleRunTab || !file) return;
    setErrorBanner(null);
    setLaunchingMode(mode);
    try {
      await launchHooks(
        { projectId: project.id, projectPath: project.projectPath, mode, provider },
        lifecycleRunTab,
      );
    } catch (err) {
      setErrorBanner({
        code: 'launch-failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLaunchingMode(null);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('loading')}</div>
    );
  }
  if (error || !file) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="rounded-n-lg border border-n-border-default bg-n-surface px-7 py-7 text-center">
          <h3 className="text-[14px] font-semibold text-n-fg">{t('errorTitle')}</h3>
          {error && (
            <p className="mt-1 break-all font-n-mono text-[11.5px] text-n-muted">{error}</p>
          )}
          <button
            type="button"
            onClick={refresh}
            className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  const auditScore = parseAuditScore(auditContent);

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* ── Breadcrumb header ── */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-7 py-3.5">
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
            >
              <ArrowLeft size={14} strokeWidth={2} /> {t('back')}
            </button>
            <span className="h-3.5 w-px bg-n-border-subtle" />
          </>
        )}
        <Zap size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">Hooks</strong>
        <span
          className="truncate font-n-mono text-[11px] text-n-faint"
          title={file.path}
        >
          {file.path}
        </span>
        <span className="flex-1" />
        {/* CTA buttons */}
        <div className="flex gap-1.5">
          {lifecycleRunTab && file.exists && (
            <>
              <button
                type="button"
                disabled={launchingMode !== null}
                onClick={() => void handleLaunchRun('audit')}
                className={
                  'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-2.5 font-n-mono text-[11.5px] text-n-muted ' +
                  (launchingMode === null
                    ? 'hover:bg-n-raised hover:text-n-fg'
                    : 'opacity-60')
                }
                title={t('runAuditTitle')}
              >
                {launchingMode === 'audit' ? (
                  <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <ShieldCheck size={12} strokeWidth={2} />
                )}
                {launchingMode === 'audit' ? t('runLaunching') : t('runAudit')}
              </button>
              <button
                type="button"
                disabled={launchingMode !== null}
                onClick={() => void handleLaunchRun('fix')}
                className={
                  'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent ' +
                  (launchingMode === null ? 'hover:bg-n-accent-soft' : 'opacity-60')
                }
                title={t('runFixTitle')}
              >
                {launchingMode === 'fix' ? (
                  <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Wrench size={12} strokeWidth={2} />
                )}
                {launchingMode === 'fix' ? t('runLaunching') : t('runFix')}
              </button>
              <button
                type="button"
                disabled={launchingMode !== null}
                onClick={() => void handleLaunchRun('edit')}
                className={
                  'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-2.5 font-n-mono text-[11.5px] text-n-muted ' +
                  (launchingMode === null ? 'hover:bg-n-raised hover:text-n-fg' : 'opacity-60')
                }
                title={t('runEditTitle')}
              >
                {launchingMode === 'edit' ? (
                  <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Play size={12} strokeWidth={2} />
                )}
                {launchingMode === 'edit' ? t('runLaunching') : t('runEdit')}
              </button>
            </>
          )}
          {lifecycleRunTab && (
            <button
              type="button"
              disabled={launchingMode !== null}
              onClick={() => void handleLaunchRun('create')}
              className={
                'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent-strong ' +
                (launchingMode === null ? 'hover:bg-n-accent-soft/80' : 'opacity-60')
              }
              title={t('runCreateTitle')}
            >
              {launchingMode === 'create' ? (
                <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <Sparkles size={12} strokeWidth={2} />
              )}
              {launchingMode === 'create' ? t('runLaunching') : t('runCreate')}
            </button>
          )}
        </div>
      </div>

      {/* ── Missing file banner ── */}
      {!file.exists && (
        <div className="mx-7 mt-4 flex items-center justify-between gap-3 rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-n-muted">
            <AlertTriangle size={14} className="flex-shrink-0 text-n-watch" />
            {t('missingBanner')}
          </div>
          {lifecycleRunTab && (
            <button
              type="button"
              disabled={launchingMode !== null}
              onClick={() => void handleLaunchRun('create')}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
            >
              <Sparkles size={11} />
              {t('missingBannerCta')}
            </button>
          )}
        </div>
      )}

      {/* ── Error banner ── */}
      {errorBanner && (
        <div className="mx-7 mt-4 flex items-start justify-between gap-3 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[oklch(0.55_0.16_25)]" />
            <div>
              <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-[oklch(0.55_0.16_25)]">
                {t(`errors.${errorBanner.code}Title`, { defaultValue: errorBanner.code })}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-n-fg">{errorBanner.message}</div>
            </div>
          </div>
          {errorBanner.showReload && (
            <button
              type="button"
              onClick={refresh}
              className="flex-shrink-0 rounded-n-sm border border-n-border-default bg-n-surface px-2 py-1 font-n-mono text-[11px] text-n-fg hover:bg-n-canvas"
            >
              {t('reload')}
            </button>
          )}
        </div>
      )}

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-1 border-b border-n-border-subtle px-7">
        <ScreenTabButton
          id="edit"
          label={t('tabs.edit')}
          icon={<FileText size={13} strokeWidth={2} />}
          active={tab}
          setTab={setTab}
        />
        <ScreenTabButton
          id="audit"
          label={t('tabs.audit')}
          icon={<ShieldCheck size={13} strokeWidth={2} />}
          count={audits.length || undefined}
          active={tab}
          setTab={setTab}
        />
        <ScreenTabButton
          id="fix"
          label={t('tabs.fix')}
          icon={<Wrench size={13} strokeWidth={2} />}
          active={tab}
          setTab={setTab}
        />
      </div>

      {/* ── Tab body ── */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'edit' && (
          <EditTab
            file={file}
            body={body}
            setBody={setBody}
            dirty={dirty}
            submitting={submitting}
            jsonValidation={jsonValidation}
            editMode={editMode}
            setEditMode={setEditMode}
            onSave={handleSave}
            onReset={handleReset}
            t={t}
          />
        )}
        {tab === 'audit' && (
          <AuditTab
            audits={audits}
            selectedAudit={selectedAudit}
            setSelectedAudit={setSelectedAudit}
            auditContent={auditContent}
            auditContentError={auditContentError}
            auditScore={auditScore}
            onOpenRunTab={lifecycleRunTab}
            launchingMode={launchingMode}
            onLaunchFix={() => void handleLaunchRun('fix')}
            t={t}
          />
        )}
        {tab === 'fix' && (
          <FixTab
            hasAudit={audits.length > 0}
            onOpenRunTab={lifecycleRunTab}
            launchingMode={launchingMode}
            onLaunchFix={() => void handleLaunchRun('fix')}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab strip button ───────────────────────────────────────────────────────

function ScreenTabButton({
  id,
  label,
  icon,
  count,
  active,
  setTab,
}: {
  id: ScreenTab;
  label: string;
  icon: React.ReactNode;
  count?: number;
  active: ScreenTab;
  setTab(t: ScreenTab): void;
}) {
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => setTab(id)}
      aria-current={isActive ? 'page' : undefined}
      className={
        'group -mb-px inline-flex items-center gap-1.5 border-b-2 bg-transparent px-3 py-2.5 text-[12.5px] font-medium transition-colors ' +
        (isActive
          ? 'border-n-accent text-n-fg'
          : 'border-transparent text-n-muted hover:text-n-fg')
      }
    >
      <span className={isActive ? 'text-n-accent' : 'text-n-subtle'}>{icon}</span>
      {label}
      {count != null && (
        <span className="font-n-mono tabular-nums text-[10.5px] text-n-faint">{count}</span>
      )}
    </button>
  );
}

// ── Edit tab ───────────────────────────────────────────────────────────────

interface EditTabProps {
  file: import('@nakiros/shared').HooksReadResult;
  body: string;
  setBody(b: string): void;
  dirty: boolean;
  submitting: boolean;
  jsonValidation: { valid: boolean; message?: string };
  editMode: EditMode;
  setEditMode(m: EditMode): void;
  onSave(): void;
  onReset(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function EditTab({
  file,
  body,
  setBody,
  dirty,
  submitting,
  jsonValidation,
  editMode,
  setEditMode,
  onSave,
  onReset,
  t,
}: EditTabProps) {
  // If JSON becomes invalid while in form mode, we force JSON mode so the
  // user can see and fix the syntax error.
  const effectiveMode: EditMode = !jsonValidation.valid ? 'json' : editMode;

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: '100%' }}>
      {/* Main editor area */}
      <div className="flex flex-1 flex-col gap-3 overflow-auto px-7 pb-8 pt-4">
        {/* Top toolbar: validation badge + mode toggle + save/reset */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: validation badge + mode toggle */}
          <div className="flex items-center gap-2">
            {jsonValidation.valid ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.55_0.18_145_/_0.3)] bg-[oklch(0.55_0.18_145_/_0.08)] px-2.5 py-0.5 font-n-mono text-[11px] text-[oklch(0.42_0.18_145)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.55_0.18_145)]" />
                {t('editTab.validJson')}
              </span>
            ) : (
              <span
                className="inline-flex max-w-[440px] items-start gap-1.5 rounded-full border border-[oklch(0.74_0.16_25_/_0.3)] bg-[oklch(0.74_0.16_25_/_0.08)] px-2.5 py-0.5 font-n-mono text-[11px] text-[oklch(0.50_0.16_25)]"
                title={jsonValidation.message}
              >
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[oklch(0.74_0.16_25)]" />
                <span className="truncate">
                  {t('editTab.invalidJson')}: {jsonValidation.message}
                </span>
              </span>
            )}

            {/* Form / JSON mode toggle */}
            <div className="inline-flex rounded-n-md border border-n-border-subtle bg-n-surface p-0.5">
              <button
                type="button"
                disabled={!jsonValidation.valid}
                onClick={() => setEditMode('form')}
                title={!jsonValidation.valid ? t('editTab.formDisabledTooltip') : undefined}
                className={
                  'rounded-[5px] px-2.5 py-1 font-n-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
                  (effectiveMode === 'form'
                    ? 'bg-n-accent-soft text-n-accent-strong'
                    : 'text-n-muted hover:text-n-fg')
                }
              >
                {t('editTab.form')}
              </button>
              <button
                type="button"
                onClick={() => setEditMode('json')}
                className={
                  'rounded-[5px] px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
                  (effectiveMode === 'json'
                    ? 'bg-n-accent-soft text-n-accent-strong'
                    : 'text-n-muted hover:text-n-fg')
                }
              >
                {t('editTab.json')}
              </button>
            </div>
          </div>

          {/* Right: Save / Reset toolbar */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onReset}
              disabled={!dirty || submitting}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:bg-n-raised disabled:opacity-50"
            >
              {t('editTab.reset')}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || submitting || !jsonValidation.valid}
              className="inline-flex items-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
            >
              {t('editTab.save')}
            </button>
          </div>
        </div>

        {/* Editor body: Form or JSON */}
        {effectiveMode === 'form' ? (
          <HooksFormEditor value={body} onChange={setBody} />
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('editTab.placeholder')}
            spellCheck={false}
            className={
              'w-full flex-1 resize-none rounded-n-md border bg-n-surface p-4 font-n-mono text-[12.5px] leading-relaxed text-n-fg placeholder:text-n-faint focus:outline-none focus:ring-1 ' +
              (jsonValidation.valid
                ? 'border-n-border-subtle focus:border-n-accent-line focus:ring-n-accent-line'
                : 'border-[oklch(0.74_0.16_25_/_0.4)] focus:border-[oklch(0.74_0.16_25_/_0.6)] focus:ring-[oklch(0.74_0.16_25_/_0.3)]')
            }
            style={{ minHeight: '60vh' }}
          />
        )}

        {!file.exists && (
          <p className="font-n-mono text-[11px] text-n-faint">
            {t('editTab.newFileHint')}
          </p>
        )}
      </div>

      {/* Sidebar */}
      <EditSidebar body={body} jsonValidation={jsonValidation} t={t} />
    </div>
  );
}

// ── Edit sidebar ───────────────────────────────────────────────────────────

interface HookEventStat {
  event: string;
  count: number;
}

function parseHooksMetrics(body: string): {
  events: HookEventStat[];
  disableAllHooks: boolean;
  missingTimeout: boolean;
  insecureHttp: boolean;
} | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const events: HookEventStat[] = [];
    let disableAllHooks = false;
    let missingTimeout = false;
    let insecureHttp = false;

    if (parsed['disableAllHooks'] === true) {
      disableAllHooks = true;
    }

    const knownEvents = [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'Notification',
      'Stop',
      'SubagentStop',
      'SessionEnd',
    ];

    for (const ev of knownEvents) {
      const handlers = parsed[ev];
      if (Array.isArray(handlers) && handlers.length > 0) {
        events.push({ event: ev, count: handlers.length });
        for (const handler of handlers as Record<string, unknown>[]) {
          if (handler['timeout'] == null) missingTimeout = true;
          const url = handler['url'];
          if (typeof url === 'string' && url.startsWith('http://')) insecureHttp = true;
          const hooks = handler['hooks'];
          if (Array.isArray(hooks)) {
            for (const h of hooks as Record<string, unknown>[]) {
              if (h['timeout'] == null) missingTimeout = true;
              const hUrl = h['url'];
              if (typeof hUrl === 'string' && hUrl.startsWith('http://')) insecureHttp = true;
            }
          }
        }
      }
    }

    return { events, disableAllHooks, missingTimeout, insecureHttp };
  } catch {
    return null;
  }
}

function EditSidebar({
  body,
  jsonValidation,
  t,
}: {
  body: string;
  jsonValidation: { valid: boolean };
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const metrics = useMemo(() => {
    if (!jsonValidation.valid) return null;
    return parseHooksMetrics(body);
  }, [body, jsonValidation.valid]);

  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-auto border-l border-n-border-subtle bg-n-surface px-4 py-4 lg:flex">
      {!jsonValidation.valid || !metrics ? (
        <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-3 py-2.5 font-n-mono text-[11px] text-n-muted">
          {t('editTab.sidebarEmpty')}
        </div>
      ) : (
        <>
          <SidebarSection title={t('editTab.eventsCount')}>
            <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1.5">
              <div className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">
                {t('editTab.eventsConfigured')}
              </div>
              <div className="mt-0.5 font-n-mono text-[14px] font-semibold text-n-fg">
                {metrics.events.length}
              </div>
            </div>
          </SidebarSection>

          {metrics.events.length > 0 && (
            <SidebarSection title={t('editTab.handlersPerEvent')}>
              <div className="flex flex-col gap-1">
                {metrics.events.map((ev) => (
                  <div
                    key={ev.event}
                    className="flex items-center justify-between rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1"
                  >
                    <span className="font-n-mono text-[11px] text-n-fg">{ev.event}</span>
                    <span className="font-n-mono tabular-nums text-[11px] text-n-accent">
                      {ev.count}
                    </span>
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}

          {(metrics.disableAllHooks || metrics.missingTimeout || metrics.insecureHttp) && (
            <SidebarSection title="Warnings">
              <div className="flex flex-col gap-1.5">
                {metrics.disableAllHooks && (
                  <WarningBadge level="warn" message={t('editTab.warnings.disableAllHooks')} />
                )}
                {metrics.missingTimeout && (
                  <WarningBadge level="warn" message={t('editTab.warnings.missingTimeout')} />
                )}
                {metrics.insecureHttp && (
                  <WarningBadge level="critical" message={t('editTab.warnings.insecureHttp')} />
                )}
              </div>
            </SidebarSection>
          )}
        </>
      )}
    </aside>
  );
}

function WarningBadge({ level, message }: { level: 'warn' | 'critical'; message: string }) {
  const isCritical = level === 'critical';
  return (
    <div
      className={
        'flex items-start gap-1.5 rounded-n-sm border px-2 py-1.5 text-[11px] leading-snug ' +
        (isCritical
          ? 'border-[oklch(0.74_0.16_25_/_0.3)] bg-[oklch(0.74_0.16_25_/_0.07)] text-[oklch(0.50_0.16_25)]'
          : 'border-[oklch(0.74_0.18_60_/_0.3)] bg-[oklch(0.74_0.18_60_/_0.07)] text-[oklch(0.50_0.18_60)]')
      }
    >
      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ── Audit tab ──────────────────────────────────────────────────────────────

function AuditTab({
  audits,
  selectedAudit,
  setSelectedAudit,
  auditContent,
  auditContentError,
  auditScore,
  onOpenRunTab,
  launchingMode,
  onLaunchFix,
  t,
}: {
  audits: HooksAuditHistoryEntry[];
  selectedAudit: GenericAuditEntry | null;
  setSelectedAudit(e: GenericAuditEntry | null): void;
  auditContent: string | null;
  auditContentError: string | null;
  auditScore: AuditScore | null;
  onOpenRunTab?: OpenRunTabCallback;
  launchingMode: HooksRunMode | null;
  onLaunchFix(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (audits.length === 0) {
    return (
      <div className="px-7 py-6">
        <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center">
          <div className="font-n-mono text-[12.5px] text-n-muted">
            {t('auditTab.empty')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-7 py-6">
      {/* Audit header card */}
      <div className="mb-4 rounded-n-lg border border-n-border-subtle bg-n-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2">
              <AuditHistoryPicker
                entries={audits}
                selected={selectedAudit}
                onSelect={setSelectedAudit}
              />
            </div>
            <div className="font-n-mono text-[18px] text-n-fg">
              Audit — <span className="text-n-accent">Hooks</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing
              value={auditScore?.value ?? null}
              max={auditScore?.max ?? 100}
              size={64}
            />
            {onOpenRunTab && (
              <button
                type="button"
                disabled={launchingMode !== null}
                onClick={onLaunchFix}
                className={
                  'inline-flex h-9 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[12px] text-n-accent ' +
                  (launchingMode === null ? 'hover:bg-n-accent-soft' : 'opacity-60')
                }
              >
                {launchingMode === 'fix' ? (
                  <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Wrench size={13} strokeWidth={2} />
                )}
                {launchingMode === 'fix' ? t('runLaunching') : t('auditTab.fixFromAudit')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audit body */}
      {auditContentError && (
        <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
          {auditContentError}
        </div>
      )}
      {!auditContentError && auditContent === null && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-6 font-n-mono text-[12px] text-n-muted">
          {t('auditTab.loading')}
        </div>
      )}
      {!auditContentError && auditContent !== null && auditContent.trim() === '' && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-6 font-n-mono text-[12px] text-n-muted">
          {t('auditTab.emptyReport')}
        </div>
      )}
      {!auditContentError && auditContent !== null && auditContent.trim() !== '' && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface px-6 py-5">
          <AuditMarkdownViewer content={auditContent} />
        </div>
      )}
    </div>
  );
}

// ── Fix tab ────────────────────────────────────────────────────────────────

function FixTab({
  hasAudit,
  onOpenRunTab,
  launchingMode,
  onLaunchFix,
  t,
}: {
  hasAudit: boolean;
  onOpenRunTab?: OpenRunTabCallback;
  launchingMode: HooksRunMode | null;
  onLaunchFix(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="mx-auto max-w-[760px] px-7 py-10 font-n-sans">
      <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-n-md bg-n-violet-soft text-n-violet">
            <Wrench size={20} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h3 className="m-0 text-[15px] font-semibold text-n-fg">{t('fixTab.title')}</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-n-muted">
              {t('fixTab.lead')}
            </p>
            {!hasAudit && (
              <p className="mt-2 rounded-n-sm border border-n-border-subtle bg-n-sunken px-2 py-1.5 font-n-mono text-[11px] text-n-muted">
                {t('fixTab.cantFixWithoutAudit')}
              </p>
            )}
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!onOpenRunTab || launchingMode !== null || !hasAudit}
                onClick={onLaunchFix}
                className={
                  'inline-flex h-8 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[12px] text-n-accent ' +
                  (onOpenRunTab && launchingMode === null && hasAudit
                    ? 'hover:bg-n-accent-soft'
                    : 'opacity-60')
                }
              >
                {launchingMode === 'fix' ? (
                  <RefreshCw size={12} strokeWidth={2.25} className="animate-spin" />
                ) : (
                  <Play size={12} strokeWidth={2.25} />
                )}
                {launchingMode === 'fix' ? t('runLaunching') : t('fixTab.cta')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared small components ────────────────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Score extraction ───────────────────────────────────────────────────────

function parseAuditScore(content: string | null): AuditScore | null {
  if (!content) return null;
  const head = content.slice(0, 3000);
  const match = head.match(/score[^0-9]{0,20}(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}
