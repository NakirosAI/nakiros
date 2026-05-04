import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  PlusCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { ClaudeMdAuditHistoryEntry, ClaudeMdRunMode, Project } from '@nakiros/shared';
import { Crepe } from '@milkdown/crepe';
import AuditHistoryPicker from '../components/skill/AuditHistoryPicker';
import type { GenericAuditEntry } from '../components/skill/AuditHistoryPicker';
import AuditMarkdownViewer from '../components/skill/AuditMarkdownViewer';
import ScoreRing from '../components/viz/ScoreRing';
import { launchClaudemd, type OpenRunTabCallback } from '../lib/run-launcher';
import { useClaudeMdFile, useClaudeMdList } from './claude-md/useClaudeMd';

// Vendored Milkdown Crepe theme variables — see styles/milkdown-crepe.css.
// Cannot import via @milkdown/crepe/lib/... because CSS is not in package exports.
import '../styles/milkdown-crepe.css';

interface ClaudeMdScreenProps {
  project: Project;
  onBack?(): void;
  onOpenRunTab?: OpenRunTabCallback;
}

type ScreenTab = 'edit' | 'audit' | 'fix';

interface AuditScore {
  value: number;
  max: number;
}

/**
 * Refactored ClaudeMd screen — 3-tab layout aligned with SkillDetailScreen:
 *
 * 1. **Edit** — Milkdown WYSIWYG (Crepe) + raw markdown toggle + sidebar.
 * 2. **Audit** — AuditHistoryPicker (generic) + AuditMarkdownViewer + ScoreRing.
 * 3. **Fix** — Simple CTA landing.
 *
 * Scope pilules (root / .claude / local) removed — backend only exposes the
 * project-root CLAUDE.md now.
 */
export default function ClaudeMdScreen({ project, onBack, onOpenRunTab }: ClaudeMdScreenProps) {
  const { t } = useTranslation('claude-md');
  const { list, loading: listLoading, refresh: refreshList } = useClaudeMdList(project.id);
  const { file, loading, error, refresh, save, remove } = useClaudeMdFile(
    project.id,
    refreshList,
  );

  const [tab, setTab] = useState<ScreenTab>('edit');
  const [body, setBody] = useState('');
  const [useWysiwyg, setUseWysiwyg] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [launchingMode, setLaunchingMode] = useState<ClaudeMdRunMode | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  // Audit history ─────────────────────────────────────────────────────────────
  const [audits, setAudits] = useState<ClaudeMdAuditHistoryEntry[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<GenericAuditEntry | null>(null);
  const [auditContent, setAuditContent] = useState<string | null>(null);
  const [auditContentError, setAuditContentError] = useState<string | null>(null);

  const loadAudits = useCallback(async () => {
    try {
      const result = await window.nakiros.listClaudemdAudits(project.id);
      setAudits(result ?? []);
      if (result && result.length > 0 && !selectedAudit) {
        setSelectedAudit(result[0] ?? null);
      }
    } catch {
      setAudits([]);
    }
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadAudits();
  }, [loadAudits]);

  // Read audit report when selection changes
  useEffect(() => {
    if (!selectedAudit) {
      setAuditContent(null);
      return;
    }
    let cancelled = false;
    setAuditContent(null);
    setAuditContentError(null);
    window.nakiros
      .readClaudemdAudit(selectedAudit.path)
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

  // Body sync ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    setBody(file.body);
    setErrorBanner(null);
  }, [file]);

  const dirty = useMemo(() => {
    if (!file) return false;
    return body !== file.body;
  }, [file, body]);

  // Actions ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!file) return;
    setErrorBanner(null);
    setSubmitting(true);
    const result = await save({ body, mtimeAtRead: file.mtime });
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({
        code: result.code,
        message: result.message,
        showReload: result.code === 'conflict',
      });
    }
  };

  const handleDelete = async () => {
    if (!file || !file.exists) return;
    if (!window.confirm(t('confirmDelete', { path: file.path }))) return;
    setSubmitting(true);
    const result = await remove();
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({ code: result.code, message: result.message });
    }
  };

  const handleLaunchRun = async (mode: ClaudeMdRunMode) => {
    if (!onOpenRunTab || !file) return;
    setErrorBanner(null);
    setLaunchingMode(mode);
    try {
      await launchClaudemd(
        { projectId: project.id, projectPath: project.projectPath, mode },
        onOpenRunTab,
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

  const handleAddAgentsMdImport = () => {
    if (body.includes('@AGENTS.md')) return;
    const newBody = body.length === 0 ? '@AGENTS.md\n' : `@AGENTS.md\n\n${body}`;
    setBody(newBody);
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (listLoading || loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('loading')}</div>
    );
  }
  if (error || !file || !list) {
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

  const hasAgentsMdImport = body.includes('@AGENTS.md');
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
        <FileText size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">CLAUDE.md</strong>
        <span
          className="truncate font-n-mono text-[11px] text-n-faint"
          title={file.path}
        >
          {file.path}
        </span>
        <span className="flex-1" />
        {/* CTA buttons */}
        <div className="flex gap-1.5">
          {onOpenRunTab && file.exists && (
            <>
              <button
                type="button"
                disabled={!onOpenRunTab || launchingMode !== null}
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
                disabled={!onOpenRunTab || launchingMode !== null}
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
            </>
          )}
          {onOpenRunTab && !file.exists && (
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
          {onOpenRunTab && (
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
            useWysiwyg={useWysiwyg}
            setUseWysiwyg={setUseWysiwyg}
            agentsMdAtRoot={list.agentsMdAtRoot}
            hasAgentsMdImport={hasAgentsMdImport}
            onSave={handleSave}
            onDelete={handleDelete}
            onAddAgentsMd={handleAddAgentsMdImport}
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
            onOpenRunTab={onOpenRunTab}
            launchingMode={launchingMode}
            onLaunchFix={() => void handleLaunchRun('fix')}
            t={t}
          />
        )}
        {tab === 'fix' && (
          <FixTab
            hasAudit={audits.length > 0}
            onOpenRunTab={onOpenRunTab}
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
  file: import('@nakiros/shared').ClaudeMdFileContent;
  body: string;
  setBody(b: string): void;
  dirty: boolean;
  submitting: boolean;
  useWysiwyg: boolean;
  setUseWysiwyg(v: boolean): void;
  agentsMdAtRoot: boolean;
  hasAgentsMdImport: boolean;
  onSave(): void;
  onDelete(): void;
  onAddAgentsMd(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function EditTab({
  file,
  body,
  setBody,
  dirty,
  submitting,
  useWysiwyg,
  setUseWysiwyg,
  agentsMdAtRoot,
  hasAgentsMdImport,
  onSave,
  onDelete,
  onAddAgentsMd,
  t,
}: EditTabProps) {
  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: '100%' }}>
      {/* Main editor area */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-auto px-7 pb-8 pt-4">
        <div className="flex items-center justify-between">
          {/* Mode toggle */}
          <div className="flex items-center rounded-n-sm border border-n-border-subtle bg-n-canvas p-0.5">
            <button
              type="button"
              onClick={() => setUseWysiwyg(true)}
              className={
                'rounded-n-xs px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
                (useWysiwyg
                  ? 'bg-n-raised text-n-fg shadow-sm'
                  : 'text-n-muted hover:text-n-fg')
              }
            >
              {t('editTab.modeWysiwyg')}
            </button>
            <button
              type="button"
              onClick={() => setUseWysiwyg(false)}
              className={
                'rounded-n-xs px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
                (!useWysiwyg
                  ? 'bg-n-raised text-n-fg shadow-sm'
                  : 'text-n-muted hover:text-n-fg')
              }
            >
              {t('editTab.modeRaw')}
            </button>
          </div>
          {/* Save / delete */}
          <div className="flex items-center gap-1.5">
            {file.exists && (
              <button
                type="button"
                onClick={onDelete}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-n-sm border border-[oklch(0.74_0.16_25_/_0.4)] bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-[oklch(0.50_0.16_25)] hover:bg-[oklch(0.74_0.16_25_/_0.08)] disabled:opacity-50"
              >
                {t('delete')}
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || submitting}
              className="inline-flex items-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
            >
              {t('save')}
            </button>
          </div>
        </div>

        {useWysiwyg ? (
          <MilkdownEditor value={body} onChange={setBody} />
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('editTab.bodyPlaceholder')}
            className="min-h-[480px] flex-1 resize-none rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5 font-n-mono text-[12px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
        )}
      </div>

      {/* Sidebar */}
      <EditSidebar
        file={file}
        body={body}
        agentsMdAtRoot={agentsMdAtRoot}
        hasAgentsMdImport={hasAgentsMdImport}
        onAddAgentsMd={onAddAgentsMd}
        t={t}
      />
    </div>
  );
}

// ── Milkdown WYSIWYG editor ────────────────────────────────────────────────

interface MilkdownEditorProps {
  value: string;
  onChange(markdown: string): void;
}

/**
 * Thin wrapper around Milkdown Crepe. The editor is mounted imperatively
 * inside a div ref; `value` changes from outside are applied via
 * `getMarkdown` / listener. The `onChange` callback fires on every Crepe
 * markdown update so the parent body state stays in sync.
 */
function MilkdownEditor({ value, onChange }: MilkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  // Track last value written to Crepe to avoid infinite update loops.
  const lastSyncedValueRef = useRef<string>(value);

  useEffect(() => {
    if (!rootRef.current) return;

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: value,
    });

    // Listen for markdown changes and bubble them up.
    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        lastSyncedValueRef.current = markdown;
        onChange(markdown);
      });
    });

    crepeRef.current = crepe;
    void crepe.create();

    return () => {
      void crepe.destroy().catch(() => {/* ignore on unmount */});
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. after a successful save that resets
  // the body) only when they differ from what Crepe last reported to us.
  // Crepe doesn't expose a public setMarkdown API, so we destroy + re-create
  // the editor with the new value when an external reset is detected.
  useEffect(() => {
    if (value === lastSyncedValueRef.current) return;
    const crepe = crepeRef.current;
    if (!crepe || !rootRef.current) return;
    lastSyncedValueRef.current = value;
    // Destroy and re-create with the new default value.
    void crepe.destroy().then(() => {
      if (!rootRef.current) return;
      const next = new Crepe({ root: rootRef.current, defaultValue: value });
      next.on((api) => {
        api.markdownUpdated((_ctx, md) => {
          lastSyncedValueRef.current = md;
          onChange(md);
        });
      });
      crepeRef.current = next;
      void next.create();
    }).catch(() => { /* ignore on unmount race */ });
  }, [value, onChange]);

  return (
    <div
      ref={rootRef}
      className="milkdown-crepe-wrap min-h-[480px] flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas"
    />
  );
}

// ── Edit sidebar ───────────────────────────────────────────────────────────

function EditSidebar({
  file,
  body,
  agentsMdAtRoot,
  hasAgentsMdImport,
  onAddAgentsMd,
  t,
}: {
  file: import('@nakiros/shared').ClaudeMdFileContent;
  body: string;
  agentsMdAtRoot: boolean;
  hasAgentsMdImport: boolean;
  onAddAgentsMd(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const liveChars = body.length;
  const liveTokens = Math.round(liveChars / 4);
  const liveImports = useMemo(() => extractImports(body), [body]);
  const liveHasHtmlComments = useMemo(() => /<!--[\s\S]*?-->/m.test(body), [body]);
  const sectionCount = useMemo(
    () => (body.match(/^##? /gm) ?? []).length,
    [body],
  );
  const offerAgentsImport = agentsMdAtRoot && !hasAgentsMdImport;

  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-auto border-l border-n-border-subtle bg-n-surface px-4 py-4 lg:flex">
      <SidebarSection title={t('sidebar.size')}>
        <div className="grid grid-cols-2 gap-2">
          <Kpi label={t('sidebar.tokens')} value={liveTokens} />
          <Kpi label={t('sidebar.sections')} value={sectionCount} />
          <Kpi label={t('sidebar.chars')} value={liveChars} />
        </div>
      </SidebarSection>

      {file.headings.length > 0 && (
        <SidebarSection title="Headings">
          <div className="flex flex-col gap-1">
            {file.headings.map((h, i) => (
              <span
                key={`${h}-${i}`}
                className="truncate font-n-mono text-[11px] text-n-muted"
                title={h}
              >
                # {h}
              </span>
            ))}
          </div>
        </SidebarSection>
      )}

      <SidebarSection title={t('sidebar.imports')}>
        {liveImports.length === 0 ? (
          <p className="m-0 text-pretty text-[11.5px] text-n-muted">{t('sidebar.importsEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {liveImports.map((imp) => (
              <span
                key={imp}
                className="break-all rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-0.5 font-n-mono text-[11px] text-n-muted"
                title={`@${imp}`}
              >
                @{imp}
              </span>
            ))}
          </div>
        )}
        {offerAgentsImport && (
          <button
            type="button"
            onClick={onAddAgentsMd}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-n-sm border border-dashed border-n-accent-line bg-n-accent-soft px-2 py-1.5 font-n-mono text-[11px] text-n-accent-strong hover:bg-n-accent-soft/80"
          >
            <PlusCircle size={11} strokeWidth={2.5} /> {t('sidebar.importAgentsMd')}
          </button>
        )}
      </SidebarSection>

      {liveHasHtmlComments && (
        <SidebarSection title={t('sidebar.htmlComments')}>
          <p className="m-0 text-pretty text-[11.5px] leading-snug text-n-muted">
            {t('sidebar.htmlCommentsHelp')}
          </p>
        </SidebarSection>
      )}
    </aside>
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
  audits: ClaudeMdAuditHistoryEntry[];
  selectedAudit: GenericAuditEntry | null;
  setSelectedAudit(e: GenericAuditEntry | null): void;
  auditContent: string | null;
  auditContentError: string | null;
  auditScore: AuditScore | null;
  onOpenRunTab?: OpenRunTabCallback;
  launchingMode: ClaudeMdRunMode | null;
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
              Audit — <span className="text-n-accent">CLAUDE.md</span>
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
  launchingMode: ClaudeMdRunMode | null;
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
              {t('fixTab.intro')}{' '}
              (<span className="font-n-mono text-n-fg">CLAUDE.md</span>),{' '}
              {t('fixTab.introCont')}
            </p>
            {!hasAudit && (
              <p className="mt-2 rounded-n-sm border border-n-border-subtle bg-n-sunken px-2 py-1.5 font-n-mono text-[11px] text-n-muted">
                {t('fixTab.noAudit')}
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
                {launchingMode === 'fix' ? t('runLaunching') : t('fixTab.run')}
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

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1.5">
      <div className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">{label}</div>
      <div className="mt-0.5 font-n-mono text-[14px] font-semibold text-n-fg">{value}</div>
    </div>
  );
}

// ── Score extraction ───────────────────────────────────────────────────────

function parseAuditScore(content: string | null): AuditScore | null {
  if (!content) return null;
  const head = content.slice(0, 3000);
  // Tolerant to formatting noise between "Score" and the ratio:
  // colons, bold markers (`**`), inline code (` ` `), spaces. We anchor on
  // the word "score" and grab the first `<digit>/<digit>` that follows.
  const match = head.match(/score[^0-9]{0,20}(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}

// ── Import extractor ───────────────────────────────────────────────────────

/** Mirrors the daemon's import extractor — keeps the sidebar live as the
 *  user edits without round-tripping through the backend. */
function extractImports(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inCodeBlock = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s{0,3}```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const re = /@([A-Za-z0-9_./~-][\w./~@-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const path = m[1];
      if (path.includes('@')) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}
