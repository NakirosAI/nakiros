import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { SubagentsAuditHistoryEntry, SubagentsRunMode } from '@nakiros/shared';
import AuditHistoryPicker from '../../components/skill/AuditHistoryPicker';
import type { GenericAuditEntry } from '../../components/skill/AuditHistoryPicker';
import AuditMarkdownViewer from '../../components/skill/AuditMarkdownViewer';
import ScoreRing from '../../components/viz/ScoreRing';
import { MarkdownEditor } from '../../components/markdown/MarkdownEditor';
import ConfirmModal from '../../components/ConfirmModal';
import { launchSubagents, type OpenRunTabCallback } from '../../lib/run-launcher';

interface SubagentDetailScreenProps {
  projectId: string;
  projectPath: string;
  /** Relative path from `.claude/agents/` — may include `/` (e.g. `team/reviewer.md`). */
  subagentName: string;
  onBack(): void;
  onOpenRunTab?: OpenRunTabCallback;
}

type ScreenTab = 'edit' | 'audit' | 'fix';

interface AuditScore {
  value: number;
  max: number;
}

/**
 * Per-subagent detail screen — 3-tab layout aligned with RuleDetailScreen:
 *
 * 1. **Edit** — Milkdown WYSIWYG (Crepe) + raw toggle + sidebar metrics
 *    including frontmatter fields specific to subagents.
 * 2. **Audit** — AuditHistoryPicker + AuditMarkdownViewer + ScoreRing.
 * 3. **Fix** — Simple CTA landing.
 *
 * Calqué ligne par ligne sur RuleDetailScreen; uses the `subagents:read`,
 * `subagents:save`, `subagents:delete` and `subagents:listAudits` /
 * `subagents:readAudit` IPC channels.
 */
export default function SubagentDetailScreen({
  projectId,
  projectPath,
  subagentName,
  onBack,
  onOpenRunTab,
}: SubagentDetailScreenProps) {
  const { t } = useTranslation('subagents');

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
  const [launchingMode, setLaunchingMode] = useState<SubagentsRunMode | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  // ── Audit history ────────────────────────────────────────────────────────
  const [audits, setAudits] = useState<SubagentsAuditHistoryEntry[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<GenericAuditEntry | null>(null);
  const [auditContent, setAuditContent] = useState<string | null>(null);
  const [auditContentError, setAuditContentError] = useState<string | null>(null);

  // ── Load file ────────────────────────────────────────────────────────────
  const loadFile = useCallback(async () => {
    setLoading(true);
    setFileError(null);
    try {
      const result = await window.nakiros.readSubagent(projectId, subagentName);
      if (!result) {
        setExists(false);
        setBody('');
        setMtime('');
        setFilePath(`${projectPath}/.claude/agents/${subagentName}`);
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
  }, [projectId, subagentName, projectPath]);

  useEffect(() => {
    void loadFile();
  }, [loadFile]);

  // ── Load audits ──────────────────────────────────────────────────────────
  const loadAudits = useCallback(async () => {
    try {
      const result = await window.nakiros.listSubagentsAudits(projectId, subagentName);
      setAudits(result ?? []);
      if (result && result.length > 0 && !selectedAudit) {
        setSelectedAudit(result[0] ?? null);
      }
    } catch {
      setAudits([]);
    }
  }, [projectId, subagentName]); // eslint-disable-line react-hooks/exhaustive-deps

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
      .readSubagentsAudit(selectedAudit.path)
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
      const result = await window.nakiros.saveSubagent(projectId, subagentName, body, mtime);
      if (!result.ok) {
        setErrorBanner({
          code: result.code,
          message: result.message,
          showReload: result.code === 'conflict',
        });
      } else {
        // Refresh mtime after successful save.
        const refreshed = await window.nakiros.readSubagent(projectId, subagentName);
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
      const result = await window.nakiros.deleteSubagent(projectId, subagentName);
      setSubmitting(false);
      setConfirmDeleteOpen(false);
      if (!result.ok) {
        setErrorBanner({ code: result.code, message: result.message });
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

  const handleLaunchRun = async (mode: SubagentsRunMode) => {
    if (!onOpenRunTab) return;
    setErrorBanner(null);
    setLaunchingMode(mode);
    try {
      await launchSubagents(
        { projectId, projectPath, subagentName, mode },
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
      <div className="grid flex-1 place-items-center text-n-muted">{t('detail.loading')}</div>
    );
  }

  if (fileError) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="rounded-n-lg border border-n-border-default bg-n-surface px-7 py-7 text-center">
          <h3 className="text-[14px] font-semibold text-n-fg">{t('detail.errorTitle')}</h3>
          <p className="mt-1 break-all font-n-mono text-[11.5px] text-n-muted">{fileError}</p>
          <button
            type="button"
            onClick={() => void loadFile()}
            className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
          >
            {t('detail.retry')}
          </button>
        </div>
      </div>
    );
  }

  const auditScore = parseAuditScore(auditContent);
  // Build a human-readable subagent label: replace internal slashes with " / ".
  const subagentDisplayName = subagentName.replace(/\//g, ' / ');

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* ── Breadcrumb header ── */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-7 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
        >
          <ArrowLeft size={14} strokeWidth={2} /> {t('detail.back')}
        </button>
        <span className="h-3.5 w-px bg-n-border-subtle" />
        <Bot size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">{subagentDisplayName}</strong>
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
                title={t('detail.runAuditTitle')}
              >
                {launchingMode === 'audit' ? (
                  <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <ShieldCheck size={12} strokeWidth={2} />
                )}
                {launchingMode === 'audit' ? t('detail.runLaunching') : t('detail.runAudit')}
              </button>
              <button
                type="button"
                disabled={launchingMode !== null}
                onClick={() => void handleLaunchRun('fix')}
                className={
                  'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent ' +
                  (launchingMode === null ? 'hover:bg-n-accent-soft' : 'opacity-60')
                }
                title={t('detail.runFixTitle')}
              >
                {launchingMode === 'fix' ? (
                  <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Wrench size={12} strokeWidth={2} />
                )}
                {launchingMode === 'fix' ? t('detail.runLaunching') : t('detail.runFix')}
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
              title={t('detail.runCreateTitle')}
            >
              {launchingMode === 'create' ? (
                <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
              ) : (
                <Sparkles size={12} strokeWidth={2} />
              )}
              {launchingMode === 'create' ? t('detail.runLaunching') : t('detail.runCreate')}
            </button>
          )}
        </div>
      </div>

      {/* ── Missing file banner ── */}
      {!exists && (
        <div className="mx-7 mt-4 flex items-center justify-between gap-3 rounded-n-md border border-dashed border-n-border-default bg-n-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[12.5px] text-n-muted">
            <AlertTriangle size={14} className="flex-shrink-0 text-n-watch" />
            {t('detail.missingBanner')}
          </div>
          {onOpenRunTab && (
            <button
              type="button"
              disabled={launchingMode !== null}
              onClick={() => void handleLaunchRun('create')}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
            >
              <Sparkles size={11} />
              {t('detail.missingBannerCta')}
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
                {t(`detail.errors.${errorBanner.code}Title`, { defaultValue: errorBanner.code })}
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
              {t('detail.reload')}
            </button>
          )}
        </div>
      )}

      {/* ── Tab strip ── */}
      <div className="flex items-center gap-1 border-b border-n-border-subtle px-7">
        <ScreenTabButton
          id="edit"
          label={t('detail.tabs.edit')}
          icon={<Bot size={13} strokeWidth={2} />}
          active={tab}
          setTab={setTab}
        />
        <ScreenTabButton
          id="audit"
          label={t('detail.tabs.audit')}
          icon={<ShieldCheck size={13} strokeWidth={2} />}
          count={audits.length || undefined}
          active={tab}
          setTab={setTab}
        />
        <ScreenTabButton
          id="fix"
          label={t('detail.tabs.fix')}
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
            subagentName={subagentName}
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
            subagentName={subagentDisplayName}
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
        title={t('detail.confirmDeleteTitle', { defaultValue: 'Delete subagent?' })}
        body={t('detail.confirmDelete', { name: subagentName })}
        confirmLabel={submitting ? t('detail.deleting', { defaultValue: 'Deleting…' }) : t('detail.delete', { defaultValue: 'Delete' })}
        cancelLabel={t('detail.cancel', { defaultValue: 'Cancel' })}
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
  subagentName,
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
  subagentName: string;
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

  // Parse frontmatter fields relevant to subagents.
  const frontmatter = useMemo(() => parseSubagentFrontmatter(body), [body]);

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: '100%' }}>
      {/* Main editor area */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-auto px-7 pb-8 pt-4">
        {/* Save / delete toolbar */}
        <div className="flex items-center justify-end gap-1.5">
          {exists && (
            <button
              type="button"
              onClick={onDelete}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-[oklch(0.74_0.16_25_/_0.4)] bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-[oklch(0.50_0.16_25)] hover:bg-[oklch(0.74_0.16_25_/_0.08)] disabled:opacity-50"
            >
              {t('detail.editTab.delete')}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || submitting}
            className="inline-flex items-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
          >
            {t('detail.editTab.save')}
          </button>
        </div>

        <MarkdownEditor
          value={body}
          onChange={setBody}
          placeholder={t('detail.editTab.bodyPlaceholder')}
        />
      </div>

      {/* Sidebar */}
      <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-auto border-l border-n-border-subtle bg-n-surface px-4 py-4 lg:flex">
        <SidebarSection title={t('detail.editTab.sidebarSize')}>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label={t('detail.editTab.tokens')} value={liveTokens} />
            <Kpi label={t('detail.editTab.sections')} value={sectionCount} />
            <Kpi label={t('detail.editTab.lines')} value={linesCount} />
          </div>
        </SidebarSection>

        <SidebarSection title={t('detail.editTab.sidebarFrontmatter')}>
          <div className="flex flex-col gap-1.5">
            {/* model */}
            {frontmatter.model && (
              <FrontmatterRow label={t('detail.editTab.model')} value={frontmatter.model} />
            )}
            {/* description */}
            {frontmatter.description && (
              <FrontmatterRow label={t('detail.editTab.description')} value={frontmatter.description} multiline />
            )}
            {/* permissionMode */}
            {frontmatter.permissionMode && (
              <FrontmatterRow label={t('detail.editTab.permissionMode')} value={frontmatter.permissionMode} />
            )}
            {/* tools count */}
            {frontmatter.toolsCount !== null && (
              <FrontmatterRow label={t('detail.editTab.tools')} value={String(frontmatter.toolsCount)} />
            )}
            {/* skills count */}
            {frontmatter.skillsCount !== null && (
              <FrontmatterRow label={t('detail.editTab.skills')} value={String(frontmatter.skillsCount)} />
            )}
            {/* mcpServers count */}
            {frontmatter.mcpServersCount !== null && (
              <FrontmatterRow label={t('detail.editTab.mcpServers')} value={String(frontmatter.mcpServersCount)} />
            )}
            {/* hooks count */}
            {frontmatter.hooksCount !== null && (
              <FrontmatterRow label={t('detail.editTab.hooks')} value={String(frontmatter.hooksCount)} />
            )}
            {/* no frontmatter at all */}
            {!frontmatter.model &&
              !frontmatter.description &&
              !frontmatter.permissionMode &&
              frontmatter.toolsCount === null &&
              frontmatter.skillsCount === null &&
              frontmatter.mcpServersCount === null &&
              frontmatter.hooksCount === null && (
                <span className="font-n-mono text-[11px] text-n-faint">—</span>
              )}
          </div>
        </SidebarSection>

        {/* Warnings */}
        {frontmatter.permissionMode === 'bypassPermissions' && (
          <div className="flex items-start gap-1.5 rounded-n-sm border border-n-watch/40 bg-n-watch/8 px-2.5 py-2">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-n-watch" />
            <span className="text-[11px] leading-snug text-n-fg">
              {t('detail.editTab.bypassWarning')}
            </span>
          </div>
        )}
        {frontmatter.toolsCount === null && !frontmatter.permissionMode && (
          <div className="flex items-start gap-1.5 rounded-n-sm border border-n-border-subtle bg-n-surface px-2.5 py-2">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-n-subtle" />
            <span className="text-[11px] leading-snug text-n-muted">
              {t('detail.editTab.inheritsAllToolsWarning')}
            </span>
          </div>
        )}

        <SidebarSection title={t('detail.editTab.subagentName')}>
          <span className="break-all font-n-mono text-[11.5px] text-n-muted">{subagentName}</span>
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
  subagentName,
  onOpenRunTab,
  launchingMode,
  onLaunchFix,
  t,
}: {
  audits: SubagentsAuditHistoryEntry[];
  selectedAudit: GenericAuditEntry | null;
  setSelectedAudit(e: GenericAuditEntry | null): void;
  auditContent: string | null;
  auditContentError: string | null;
  auditScore: AuditScore | null;
  subagentName: string;
  onOpenRunTab?: OpenRunTabCallback;
  launchingMode: SubagentsRunMode | null;
  onLaunchFix(): void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (audits.length === 0) {
    return (
      <div className="px-7 py-6">
        <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center">
          <div className="font-n-mono text-[12.5px] text-n-muted">
            {t('detail.auditTab.empty')}
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
              Audit — <span className="text-n-accent">{subagentName}</span>
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
                {launchingMode === 'fix' ? t('detail.runLaunching') : t('detail.auditTab.fixFromAudit')}
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
          {t('detail.auditTab.loading')}
        </div>
      )}
      {!auditContentError && auditContent !== null && auditContent.trim() === '' && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-6 font-n-mono text-[12px] text-n-muted">
          {t('detail.auditTab.emptyReport')}
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
  launchingMode: SubagentsRunMode | null;
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
            <h3 className="m-0 text-[15px] font-semibold text-n-fg">{t('detail.fixTab.title')}</h3>
            <p className="mt-1.5 text-[13px] leading-snug text-n-muted">
              {t('detail.fixTab.lead')}
            </p>
            {!hasAudit && (
              <p className="mt-2 rounded-n-sm border border-n-border-subtle bg-n-sunken px-2 py-1.5 font-n-mono text-[11px] text-n-muted">
                {t('detail.fixTab.cantFixWithoutAudit')}
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
                {launchingMode === 'fix' ? t('detail.runLaunching') : t('detail.fixTab.cta')}
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

function FrontmatterRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1.5">
      <div className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">{label}</div>
      <div
        className={
          'mt-0.5 font-n-mono text-[11.5px] text-n-fg ' +
          (multiline ? 'line-clamp-3 whitespace-pre-wrap break-words' : 'truncate')
        }
        title={value}
      >
        {value}
      </div>
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

// ── Frontmatter parser for subagent-specific fields ───────────────────────

interface SubagentFrontmatter {
  model: string | null;
  description: string | null;
  permissionMode: string | null;
  /** Number of tools listed, or null if the field is absent. */
  toolsCount: number | null;
  skillsCount: number | null;
  mcpServersCount: number | null;
  hooksCount: number | null;
}

/**
 * Parses YAML frontmatter from a subagent markdown file to extract
 * display-relevant fields. Only looks in the first 100 lines.
 */
function parseSubagentFrontmatter(content: string): SubagentFrontmatter {
  const result: SubagentFrontmatter = {
    model: null,
    description: null,
    permissionMode: null,
    toolsCount: null,
    skillsCount: null,
    mcpServersCount: null,
    hooksCount: null,
  };

  const header = content.split('\n').slice(0, 100).join('\n');
  const fmMatch = header.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch?.[1]) return result;
  const fm = fmMatch[1];

  // Scalar fields
  const scalarMatch = (key: string): string | null => {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null;
  };

  result.model = scalarMatch('model');
  result.permissionMode = scalarMatch('permissionMode');

  // description: may be multi-line block scalar — capture first non-empty content
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  if (descMatch?.[1]) {
    result.description = descMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  // Count list items under a given key
  const countListItems = (key: string): number | null => {
    const keyRegex = new RegExp(`^${key}:\\s*$`, 'm');
    if (!keyRegex.test(fm)) {
      // Inline list: `tools: [a, b, c]`
      const inlineMatch = fm.match(new RegExp(`^${key}:\\s*\\[([^\\]]+)\\]`, 'm'));
      if (inlineMatch?.[1]) {
        return inlineMatch[1].split(',').filter(Boolean).length;
      }
      return null;
    }
    const lines = fm.split('\n');
    const keyIdx = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l));
    if (keyIdx < 0) return null;
    let count = 0;
    for (let i = keyIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) break;
      if (/^\s+-\s+/.test(line)) count++;
      else if (/^\S/.test(line) && !line.startsWith('-')) break;
    }
    return count > 0 ? count : null;
  };

  result.toolsCount = countListItems('tools');
  result.skillsCount = countListItems('skills');
  result.mcpServersCount = countListItems('mcpServers');
  result.hooksCount = countListItems('hooks');

  return result;
}
