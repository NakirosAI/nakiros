import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Play,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { OutputStylesAuditHistoryEntry, OutputStylesRunMode } from '@nakiros/shared';
import AuditHistoryPicker from '../../components/skill/AuditHistoryPicker';
import type { GenericAuditEntry } from '../../components/skill/AuditHistoryPicker';
import AuditMarkdownViewer from '../../components/skill/AuditMarkdownViewer';
import ScoreRing from '../../components/viz/ScoreRing';
import { ResourceEditorMain } from '../../components/configuration/ResourceEditPane';
import ConfirmModal from '../../components/ConfirmModal';
import { launchOutputStyles, type OpenRunTabCallback } from '../../lib/run-launcher';

interface OutputStyleDetailScreenProps {
  projectId: string;
  projectPath: string;
  /** Relative path from `.claude/output-styles/` — e.g. `minimal.md`. */
  styleName: string;
  onBack(): void;
  onOpenRunTab?: OpenRunTabCallback;
}

type ScreenTab = 'edit' | 'audit' | 'fix';

interface AuditScore {
  value: number;
  max: number;
}

/**
 * Per-style detail screen — 3-tab layout mirroring RuleDetailScreen:
 *
 * 1. **Edit** — Milkdown WYSIWYG (Crepe) + raw toggle + sidebar metrics specific
 *    to output styles (role detection, description length, body lines).
 * 2. **Audit** — AuditHistoryPicker + AuditMarkdownViewer + ScoreRing.
 * 3. **Fix** — Simple CTA landing.
 *
 * Uses the `outputStyles:read`, `outputStyles:save`, `outputStyles:delete`,
 * `outputStyles:listAudits`, and `outputStyles:readAudit` IPC channels.
 */
export default function OutputStyleDetailScreen({
  projectId,
  projectPath,
  styleName,
  onBack,
  onOpenRunTab,
}: OutputStyleDetailScreenProps) {
  const { t } = useTranslation('output-styles-runner');

  // ── File state ──────────────────────────────────────────────────────────
  const [body, setBody] = useState('');
  const [mtime, setMtime] = useState('');
  const [exists, setExists] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<ScreenTab>('edit');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [launchingMode, setLaunchingMode] = useState<OutputStylesRunMode | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  // ── Audit history ────────────────────────────────────────────────────────
  const [audits, setAudits] = useState<OutputStylesAuditHistoryEntry[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<GenericAuditEntry | null>(null);
  const [auditContent, setAuditContent] = useState<string | null>(null);
  const [auditContentError, setAuditContentError] = useState<string | null>(null);

  // ── Load file ────────────────────────────────────────────────────────────
  const loadFile = useCallback(async () => {
    setLoading(true);
    setFileError(null);
    try {
      const result = await window.nakiros.readOutputStyle(projectId, styleName);
      if (!result) {
        setExists(false);
        setBody('');
        setMtime('');
        setFilePath(`${projectPath}/.claude/output-styles/${styleName}`);
      } else {
        setExists(result.exists);
        setBody(result.content);
        setMtime(result.mtime);
        setFilePath(result.path);
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, styleName, projectPath]);

  useEffect(() => {
    void loadFile();
  }, [loadFile]);

  // ── Load audits ──────────────────────────────────────────────────────────
  const loadAudits = useCallback(async () => {
    try {
      const result = await window.nakiros.listOutputStylesAudits(projectId, styleName);
      setAudits(result ?? []);
      if (result && result.length > 0 && !selectedAudit) {
        setSelectedAudit(result[0] ?? null);
      }
    } catch {
      setAudits([]);
    }
  }, [projectId, styleName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadAudits();
  }, [loadAudits]);

  // ── Read audit report when selection changes ─────────────────────────────
  useEffect(() => {
    if (!selectedAudit) {
      setAuditContent(null);
      return;
    }
    let cancelled = false;
    setAuditContent(null);
    setAuditContentError(null);
    window.nakiros
      .readOutputStylesAudit(selectedAudit.path)
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

  // Tracks whether body differs from the on-disk version.
  const [originalBody, setOriginalBody] = useState('');
  // Sync originalBody once the file has loaded (not on every keystroke).
  useEffect(() => {
    if (!loading) setOriginalBody(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const isDirty = body !== originalBody;

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setErrorBanner(null);
    setSubmitting(true);
    try {
      const result = await window.nakiros.saveOutputStyle(projectId, styleName, body, mtime);
      if (!result.ok) {
        setErrorBanner({
          code: result.code ?? 'write-failed',
          message: result.message ?? 'Save failed',
          showReload: result.code === 'conflict',
        });
      } else {
        // Refresh mtime after successful save.
        const refreshed = await window.nakiros.readOutputStyle(projectId, styleName);
        if (refreshed) {
          setMtime(refreshed.mtime);
          setOriginalBody(body);
        }
      }
    } catch (err) {
      setErrorBanner({
        code: 'write-failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!exists) return;
    setConfirmDeleteOpen(true);
  };

  const performDelete = async () => {
    if (!exists) return;
    setSubmitting(true);
    try {
      const result = await window.nakiros.deleteOutputStyle(projectId, styleName);
      setSubmitting(false);
      setConfirmDeleteOpen(false);
      if (!result.ok) {
        setErrorBanner({ code: result.code ?? 'write-failed', message: result.message ?? 'Delete failed' });
      } else {
        onBack();
      }
    } catch (err) {
      setSubmitting(false);
      setConfirmDeleteOpen(false);
      setErrorBanner({
        code: 'write-failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleLaunchRun = async (mode: OutputStylesRunMode) => {
    if (!onOpenRunTab) return;
    setErrorBanner(null);
    setLaunchingMode(mode);
    try {
      await launchOutputStyles(
        { projectId, projectPath, styleName, mode },
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

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('loading')}</div>
    );
  }

  if (fileError) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="rounded-n-lg border border-n-border-default bg-n-surface px-7 py-7 text-center">
          <h3 className="text-[14px] font-semibold text-n-fg">{t('errorTitle')}</h3>
          <p className="mt-1 break-all font-n-mono text-[11.5px] text-n-muted">{fileError}</p>
          <button
            type="button"
            onClick={() => void loadFile()}
            className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  const auditScore = parseAuditScore(auditContent);
  const styleDisplayName = styleName.replace(/\//g, ' / ');

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* ── Breadcrumb header ── */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-7 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
        >
          <ArrowLeft size={14} strokeWidth={2} /> {t('back')}
        </button>
        <span className="h-3.5 w-px bg-n-border-subtle" />
        <Sliders size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">{styleDisplayName}</strong>
        <span
          className="truncate font-n-mono text-[11px] text-n-faint"
          title={filePath}
        >
          {filePath}
        </span>
        <span className="flex-1" />
        {/* CTA buttons */}
        <div className="flex gap-1.5">
          {onOpenRunTab && exists && (
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
          {onOpenRunTab && !exists && (
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
      {!exists && (
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
              onClick={() => void loadFile()}
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
            body={body}
            setBody={setBody}
            isDirty={isDirty}
            submitting={submitting}
            exists={exists}
            styleName={styleName}
            linesCount={body.split('\n').filter(Boolean).length}
            onSave={() => void handleSave()}
            onDelete={handleDelete}
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
            styleDisplayName={styleDisplayName}
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

      <ConfirmModal
        open={confirmDeleteOpen}
        title={t('confirmDeleteTitle', { defaultValue: 'Delete style?' })}
        body={t('confirmDelete', { name: styleName })}
        confirmLabel={submitting ? t('deleting', { defaultValue: 'Deleting…' }) : t('delete', { defaultValue: 'Delete' })}
        cancelLabel={t('cancel', { defaultValue: 'Cancel' })}
        loading={submitting}
        onConfirm={() => void performDelete()}
        onCancel={() => {
          if (submitting) return;
          setConfirmDeleteOpen(false);
        }}
      />
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

function EditTab({
  body,
  setBody,
  isDirty,
  submitting,
  exists,
  styleName,
  linesCount,
  onSave,
  onDelete,
  t,
}: {
  body: string;
  setBody(b: string): void;
  isDirty: boolean;
  submitting: boolean;
  exists: boolean;
  styleName: string;
  linesCount: number;
  onSave(): void;
  onDelete(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const liveChars = body.length;
  const liveTokens = Math.round(liveChars / 4);
  const sectionCount = useMemo(
    () => (body.match(/^## /gm) ?? []).length,
    [body],
  );

  // Parse frontmatter fields
  const frontmatter = useMemo(() => parseFrontmatter(body), [body]);
  const hasRole = useMemo(() => hasExplicitRole(body), [body]);
  const descriptionTooShort =
    frontmatter.description !== null && frontmatter.description.length < 30;
  const bodyTooShort = linesCount < 5;

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: '100%' }}>
      <ResourceEditorMain
        value={body}
        onChange={setBody}
        editorKind="markdown"
        exists={exists}
        dirty={isDirty}
        submitting={submitting}
        saveLabel={t('editTab.save')}
        deleteLabel={t('editTab.delete')}
        onSave={onSave}
        onDelete={onDelete}
        placeholder={t('editTab.bodyPlaceholder')}
      />

      {/* Sidebar */}
      <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-auto border-l border-n-border-subtle bg-n-surface px-4 py-4 lg:flex">
        <SidebarSection title={t('editTab.sidebarSize')}>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label={t('editTab.tokens')} value={liveTokens} />
            <Kpi label={t('editTab.sections')} value={sectionCount} />
            <Kpi label={t('editTab.lines')} value={linesCount} />
          </div>
        </SidebarSection>

        {/* Frontmatter fields */}
        {(frontmatter.name !== null || frontmatter.description !== null) && (
          <SidebarSection title="Frontmatter">
            <div className="flex flex-col gap-1.5">
              {frontmatter.name !== null && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-faint">
                    {t('editTab.name')}
                  </span>
                  <span className="break-all font-n-mono text-[11.5px] text-n-muted">
                    {frontmatter.name}
                  </span>
                </div>
              )}
              {frontmatter.description !== null && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-faint">
                    {t('editTab.description')}
                  </span>
                  <span className="break-words text-[11.5px] text-n-muted">
                    {frontmatter.description}
                  </span>
                </div>
              )}
              {frontmatter.keepCodingInstructions !== null && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={
                      'rounded-n-sm border px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.7px] ' +
                      (frontmatter.keepCodingInstructions
                        ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                        : 'border-n-border-subtle bg-n-canvas text-n-muted')
                    }
                  >
                    {t('editTab.keepCodingInstructions')}
                  </span>
                  <span className="font-n-mono text-[10.5px] text-n-muted">
                    {frontmatter.keepCodingInstructions ? 'true' : 'false'}
                  </span>
                </div>
              )}
            </div>
          </SidebarSection>
        )}

        {/* Quality helpers */}
        <SidebarSection title="Checks">
          <div className="flex flex-col gap-1.5">
            <HelperBadge
              level={hasRole ? 'ok' : 'warn'}
              label={hasRole ? t('editTab.hasRole') : t('editTab.noRole')}
            />
            {descriptionTooShort && (
              <HelperBadge level="warn" label={t('editTab.descriptionTooShort')} />
            )}
            {bodyTooShort && (
              <HelperBadge level="error" label={t('editTab.bodyTooShort')} />
            )}
          </div>
        </SidebarSection>

        <SidebarSection title={t('editTab.name')}>
          <span className="break-all font-n-mono text-[11.5px] text-n-muted">{styleName}</span>
        </SidebarSection>
      </aside>
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
  styleDisplayName,
  onOpenRunTab,
  launchingMode,
  onLaunchFix,
  t,
}: {
  audits: OutputStylesAuditHistoryEntry[];
  selectedAudit: GenericAuditEntry | null;
  setSelectedAudit(e: GenericAuditEntry | null): void;
  auditContent: string | null;
  auditContentError: string | null;
  auditScore: AuditScore | null;
  styleDisplayName: string;
  onOpenRunTab?: OpenRunTabCallback;
  launchingMode: OutputStylesRunMode | null;
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
              Audit — <span className="text-n-accent">{styleDisplayName}</span>
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
  launchingMode: OutputStylesRunMode | null;
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

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1.5">
      <div className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">{label}</div>
      <div className="mt-0.5 font-n-mono text-[14px] font-semibold text-n-fg">{value}</div>
    </div>
  );
}

type HelperLevel = 'ok' | 'warn' | 'error';

function HelperBadge({ level, label }: { level: HelperLevel; label: string }) {
  const classMap: Record<HelperLevel, string> = {
    ok: 'border-n-healthy bg-n-healthy-soft text-n-healthy',
    warn: 'border-n-watch bg-n-watch-soft text-n-watch',
    error: 'border-n-critical bg-n-critical-soft text-n-critical',
  };
  const iconMap: Record<HelperLevel, React.ReactNode> = {
    ok: <CheckCircle size={10} strokeWidth={2.5} />,
    warn: <AlertTriangle size={10} strokeWidth={2.5} />,
    error: <AlertTriangle size={10} strokeWidth={2.5} />,
  };
  return (
    <div
      className={
        'inline-flex items-center gap-1.5 rounded-n-sm border px-1.5 py-0.5 font-n-mono text-[10.5px] ' +
        classMap[level]
      }
    >
      {iconMap[level]}
      {label}
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

// ── Frontmatter parser ─────────────────────────────────────────────────────

interface StyleFrontmatter {
  name: string | null;
  description: string | null;
  keepCodingInstructions: boolean | null;
}

function parseFrontmatter(content: string): StyleFrontmatter {
  const header = content.split('\n').slice(0, 50).join('\n');
  const fmMatch = header.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch?.[1]) return { name: null, description: null, keepCodingInstructions: null };
  const fm = fmMatch[1];

  const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  const keepMatch = fm.match(/^keep-coding-instructions:\s*(true|false)\s*$/im);

  return {
    name: nameMatch?.[1]?.trim() ?? null,
    description: descMatch?.[1]?.trim() ?? null,
    keepCodingInstructions: keepMatch ? keepMatch[1]?.toLowerCase() === 'true' : null,
  };
}

// ── Role detection ─────────────────────────────────────────────────────────

/**
 * Returns true when the body (outside the frontmatter block) contains an
 * explicit role instruction like "You are…", "Act as…", or "Behave as…".
 */
function hasExplicitRole(content: string): boolean {
  // Strip frontmatter first
  const stripped = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
  return /\b(you are|act as|behave as)\b/i.test(stripped);
}
