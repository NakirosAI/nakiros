import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  FileText,
  FlaskConical,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { ConfigurationProvider, Skill } from '@nakiros/shared';
import type { GenericAuditEntry } from '../components/skill/AuditHistoryPicker';
import ScoreRing from '../components/viz/ScoreRing';
import AuditHistoryPicker from '../components/skill/AuditHistoryPicker';
import AuditMarkdownViewer from '../components/skill/AuditMarkdownViewer';
import EvalMatrixGrid from '../components/skill/EvalMatrixGrid';
import SkillFilesTab from '../components/skill/SkillFilesTab';
import type { SkillTabIdentity } from '../hooks/useTabs';
import {
  auditHistoryRequestForIdentity,
  evalMatrixRequestForIdentity,
  loadSkillByIdentity,
} from '../lib/skill-identity';
import { launchAudit, launchEdit, launchFix, type OpenRunTabCallback } from '../lib/run-launcher';
import { useActiveFixForSkill } from '../hooks/useAgentRun';

interface Props {
  /** Cross-scope identity of the skill — drives every IPC call. */
  identity: SkillTabIdentity;
  provider?: ConfigurationProvider;
  /** Optional Back action — when omitted (e.g. when the screen is
   *  hosted in its own tab) the breadcrumb hides the button. */
  onBack?(): void;
  /** Wired by NewShell — opens a new run tab once a start IPC resolves. */
  onOpenRunTab?: OpenRunTabCallback;
}

type SkillTab = 'audit' | 'evals' | 'fix' | 'files';

interface AuditScore {
  value: number;
  max: number;
}

/**
 * New-design Skill detail — port of `SkillDetailScreen` in
 * `apps/Nakiros-new-design/screens-skills.jsx`. Renders the breadcrumb
 * header, the 5 tab strip, and the active tab body.
 *
 * In this PR (Phase 3 PR4), only the **Audit** tab is functional. The
 * 4 others render a "Coming soon" placeholder pointing at the upcoming
 * phase. Audit data flows through the existing IPC surface
 * (`listProjectSkills`, `listAuditHistory`, `readAuditReport`) — no
 * new channel was added.
 *
 * The audit report is rendered as raw Markdown inside a new-design
 * card. The mockup's structured Frontmatter / Inputs-Outputs /
 * Structure / Behavior cards are intentionally not reproduced here —
 * the daemon currently emits Markdown only and parsing it would be
 * fragile. We surface the score via a best-effort regex on the
 * Markdown so the ScoreRing has something to display when present.
 */
export default function SkillDetailScreen({ identity, provider = 'claude', onBack, onOpenRunTab }: Props) {
  const { t } = useTranslation('skills');
  const lifecycleRunTab = provider === 'claude' ? onOpenRunTab : undefined;
  const [skill, setSkill] = useState<Skill | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [tab, setTab] = useState<SkillTab>('audit');

  // Re-key the load on every identity field that matters so opening
  // the screen on a different skill triggers a fresh fetch.
  const identityKey = identityKeyOf(identity);

  useEffect(() => {
    let cancelled = false;
    setSkill(null);
    setSkillError(null);
    loadSkillByIdentity(identity)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setSkillError(t('notFound', { defaultValue: 'Skill not found' }));
          return;
        }
        setSkill(found);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSkillError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, t]);

  const evalRequest = useMemo(() => evalMatrixRequestForIdentity(identity), [identityKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const breadcrumbPath = skill?.skillPath ?? '';

  const [isLaunchingAudit, setIsLaunchingAudit] = useState(false);
  const [isLaunchingFix, setIsLaunchingFix] = useState(false);
  const [isLaunchingEdit, setIsLaunchingEdit] = useState(false);
  // True when a fix run is already in-flight for this skill — every Fix
  // trigger on this screen disables itself in that case to avoid stacking
  // sandboxes (only ONE fix per skill is supported by the runner today).
  const activeFix = useActiveFixForSkill(identity);

  const handleLaunchAudit = async () => {
    if (!lifecycleRunTab || isLaunchingAudit) return;
    setIsLaunchingAudit(true);
    try {
      await launchAudit(identity, lifecycleRunTab);
    } catch (err) {
      console.error('[skill] launchAudit failed', err);
    } finally {
      setIsLaunchingAudit(false);
    }
  };

  const handleLaunchFix = async () => {
    if (!lifecycleRunTab || isLaunchingFix || activeFix) return;
    setIsLaunchingFix(true);
    try {
      await launchFix(identity, lifecycleRunTab);
    } catch (err) {
      console.error('[skill] launchFix failed', err);
    } finally {
      setIsLaunchingFix(false);
    }
  };

  const handleLaunchEdit = async () => {
    if (!lifecycleRunTab || isLaunchingEdit) return;
    setIsLaunchingEdit(true);
    try {
      await launchEdit(identity, lifecycleRunTab);
    } catch (err) {
      console.error('[skill] launchEdit failed', err);
    } finally {
      setIsLaunchingEdit(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* Breadcrumb header */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-7 py-3.5">
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
            >
              <ArrowLeft size={14} strokeWidth={2} /> {t('back', { defaultValue: 'Back' })}
            </button>
            <span className="h-3.5 w-px bg-n-border-subtle" />
          </>
        )}
        <Sparkles size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">{identity.skillName}</strong>
        <span
          className="truncate font-n-mono text-[11px] text-n-faint"
          title={breadcrumbPath}
        >
          {breadcrumbPath || scopeLabel(identity)}
        </span>
        <span className="flex-1" />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!lifecycleRunTab || isLaunchingAudit}
            onClick={handleLaunchAudit}
            className={
              'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-2.5 font-n-mono text-[11.5px] text-n-muted ' +
              (lifecycleRunTab && !isLaunchingAudit ? 'hover:bg-n-raised hover:text-n-fg' : 'opacity-60')
            }
          >
            {isLaunchingAudit ? (
              <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <ShieldCheck size={12} strokeWidth={2} />
            )}
            {isLaunchingAudit
              ? t('starting', { defaultValue: 'Starting…' })
              : t('runAudit', { defaultValue: 'Audit' })}
          </button>
          <button
            type="button"
            disabled={!lifecycleRunTab || isLaunchingFix || !!activeFix}
            onClick={handleLaunchFix}
            title={
              activeFix
                ? t('fixAlreadyRunning', {
                    defaultValue: 'A fix is already running on this skill.',
                  })
                : undefined
            }
            className={
              'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent ' +
              (lifecycleRunTab && !isLaunchingFix && !activeFix
                ? 'hover:bg-n-accent-soft'
                : 'opacity-60')
            }
          >
            {isLaunchingFix ? (
              <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <Wrench size={12} strokeWidth={2} />
            )}
            {isLaunchingFix
              ? t('starting', { defaultValue: 'Starting…' })
              : activeFix
                ? t('fixRunning', { defaultValue: 'Fix running' })
                : t('runFix', { defaultValue: 'Fix' })}
          </button>
          <button
            type="button"
            disabled={!lifecycleRunTab || isLaunchingEdit}
            onClick={handleLaunchEdit}
            className={
              'inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-2.5 font-n-mono text-[11.5px] text-n-muted ' +
              (lifecycleRunTab && !isLaunchingEdit ? 'hover:bg-n-raised hover:text-n-fg' : 'opacity-60')
            }
          >
            {isLaunchingEdit ? (
              <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <Play size={12} strokeWidth={2} />
            )}
            {isLaunchingEdit
              ? t('starting', { defaultValue: 'Starting…' })
              : t('runEdit', { defaultValue: 'Edit' })}
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-n-border-subtle px-7">
        <Tab id="audit" label="Audit" icon={<ShieldCheck size={13} strokeWidth={2} />} count={skill?.auditCount} active={tab} setTab={setTab} />
        <Tab id="evals" label="Evals" icon={<FlaskConical size={13} strokeWidth={2} />} count={skill?.evals?.definitions.length} active={tab} setTab={setTab} />
        <Tab id="fix" label="Fix" icon={<Wrench size={13} strokeWidth={2} />} active={tab} setTab={setTab} />
        <Tab id="files" label="Files" icon={<FileText size={13} strokeWidth={2} />} count={skill?.files.length} active={tab} setTab={setTab} />
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto">
        {skillError && (
          <div className="m-7 rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
            {skillError}
          </div>
        )}
        {!skillError && skill && tab === 'audit' && (
          <AuditTab
            identity={identity}
            skill={skill}
            onOpenRunTab={lifecycleRunTab}
            activeFix={activeFix}
          />
        )}
        {!skillError && skill && tab === 'evals' && (
          <EvalMatrixGrid
            skill={skill}
            request={evalRequest}
            identity={identity}
            onOpenRunTab={lifecycleRunTab}
          />
        )}
        {!skillError && skill && tab === 'fix' && (
          <FixTab
            identity={identity}
            onOpenRunTab={lifecycleRunTab}
            activeFix={activeFix}
          />
        )}
        {!skillError && skill && tab === 'files' && (
          <SkillFilesTab identity={identity} skill={skill} />
        )}
      </div>
    </div>
  );
}

// ── Tab strip button ───────────────────────────────────────────────────────

function Tab({
  id,
  label,
  icon,
  count,
  active,
  setTab,
  disabled,
}: {
  id: SkillTab;
  label: string;
  icon: React.ReactNode;
  count?: number;
  active: SkillTab;
  setTab(t: SkillTab): void;
  disabled?: boolean;
}) {
  const isActive = !disabled && active === id;
  return (
    <button
      type="button"
      onClick={() => !disabled && setTab(id)}
      disabled={disabled}
      aria-current={isActive ? 'page' : undefined}
      className={
        'group -mb-px inline-flex items-center gap-1.5 border-b-2 bg-transparent px-3 py-2.5 text-[12.5px] font-medium transition-colors ' +
        (isActive
          ? 'border-n-accent text-n-fg'
          : disabled
            ? 'cursor-not-allowed border-transparent text-n-faint opacity-60'
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

// ── Audit tab ──────────────────────────────────────────────────────────────

function AuditTab({
  identity,
  skill,
  onOpenRunTab,
  activeFix,
}: {
  identity: SkillTabIdentity;
  skill: Skill;
  onOpenRunTab?: OpenRunTabCallback;
  activeFix?: ReturnType<typeof useActiveFixForSkill>;
}) {
  const { t } = useTranslation('skills');
  const [isLaunchingFixFromAudit, setIsLaunchingFixFromAudit] = useState(false);
  const handleFixFromAudit = async () => {
    if (!onOpenRunTab || isLaunchingFixFromAudit || activeFix) return;
    setIsLaunchingFixFromAudit(true);
    try {
      await launchFix(identity, onOpenRunTab);
    } catch (err) {
      console.error('[skill] launchFix from audit failed', err);
    } finally {
      setIsLaunchingFixFromAudit(false);
    }
  };
  const [history, setHistory] = useState<GenericAuditEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GenericAuditEntry | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  // Load the audit history for the skill once.
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setHistoryError(null);
    window.nakiros
      .listAuditHistory(auditHistoryRequestForIdentity(identity))
      .then((entries) => {
        if (cancelled) return;
        setHistory(entries);
        setSelected(entries[0] ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHistoryError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [identityKeyOf(identity)]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Read the selected report.
  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContent(null);
    setContentError(null);
    window.nakiros
      .readAuditReport(selected.path)
      .then((md) => {
        if (cancelled) return;
        setContent(md ?? '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContentError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const score = useMemo<AuditScore | null>(() => parseAuditScore(content), [content]);

  if (historyError) {
    return (
      <div className="m-7 rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
        {historyError}
      </div>
    );
  }

  if (history === null) {
    return (
      <div className="px-7 py-6 font-n-mono text-[12px] text-n-muted">
        {t('common:loading', { defaultValue: 'Loading…' })}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="px-7 py-6">
        <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center">
          <div className="font-n-mono text-[12.5px] text-n-muted">
            {t('auditTab.empty', { defaultValue: 'No audit has been recorded for this skill yet.' })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-6">
      {/* Audit header card */}
      <div className="mb-4 rounded-n-lg border border-n-border-subtle bg-n-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2">
              <AuditHistoryPicker entries={history} selected={selected} onSelect={setSelected} />
            </div>
            <div className="font-n-mono text-[18px] text-n-fg">
              {t('auditTab.title', { defaultValue: 'Audit —' })}{' '}
              <span className="text-n-accent">{skill.name}</span>
            </div>
            <div className="mt-1.5 text-[12px] text-n-subtle">
              {t('auditTab.file', { defaultValue: 'File:' })}{' '}
              <span className="font-n-mono">{skill.skillPath}/SKILL.md</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing
              value={score?.value ?? null}
              max={score?.max ?? 100}
              size={64}
            />
            <button
              type="button"
              disabled={!onOpenRunTab || isLaunchingFixFromAudit || !!activeFix}
              onClick={handleFixFromAudit}
              title={
                activeFix
                  ? t('fixAlreadyRunning', {
                      defaultValue: 'A fix is already running on this skill.',
                    })
                  : undefined
              }
              className={
                'inline-flex h-9 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[12px] text-n-accent ' +
                (onOpenRunTab && !isLaunchingFixFromAudit && !activeFix
                  ? 'hover:bg-n-accent-soft'
                  : 'opacity-60')
              }
            >
              {isLaunchingFixFromAudit ? (
                <RefreshCw size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <Wrench size={13} strokeWidth={2} />
              )}
              {isLaunchingFixFromAudit
                ? t('starting', { defaultValue: 'Starting…' })
                : activeFix
                  ? t('fixRunning', { defaultValue: 'Fix running' })
                  : t('auditTab.fixFromAudit', { defaultValue: 'Fix from this audit' })}
            </button>
          </div>
        </div>
      </div>

      {/* Audit body — Markdown rendered with audit-specific table styling.
          See `AuditMarkdownViewer` for the renderer overrides matching
          the new-design mockup. */}
      {contentError && (
        <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
          {contentError}
        </div>
      )}
      {!contentError && content === null && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-6 font-n-mono text-[12px] text-n-muted">
          {t('common:loading', { defaultValue: 'Loading…' })}
        </div>
      )}
      {!contentError && content !== null && content.trim() === '' && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-6 font-n-mono text-[12px] text-n-muted">
          {t('auditTab.emptyReport', { defaultValue: 'This audit report is empty.' })}
        </div>
      )}
      {!contentError && content !== null && content.trim() !== '' && (
        <div className="rounded-n-lg border border-n-border-subtle bg-n-surface px-6 py-5">
          <AuditMarkdownViewer content={content} />
        </div>
      )}
    </div>
  );
}

// ── Fix tab ────────────────────────────────────────────────────────────────

/**
 * Fix tab landing — port of `FixTab` from
 * `apps/Nakiros-new-design/screens-skills.jsx:413-436`. The "Lancer le
 * fix" CTA spawns a fix run via {@link launchFix} and the shell pushes
 * the resulting `kind: 'run'` tab in front of the user. The "Voir le
 * dernier diff" button is still disabled — it will land alongside the
 * fix benchmarks UI.
 */
function FixTab({
  identity,
  onOpenRunTab,
  activeFix,
}: {
  identity: SkillTabIdentity;
  onOpenRunTab?: OpenRunTabCallback;
  activeFix?: ReturnType<typeof useActiveFixForSkill>;
}) {
  const { t } = useTranslation('skills');
  const [isLaunching, setIsLaunching] = useState(false);

  const handleLaunch = async () => {
    if (!onOpenRunTab || isLaunching || activeFix) return;
    setIsLaunching(true);
    try {
      await launchFix(identity, onOpenRunTab);
    } catch (err) {
      console.error('[fix] launchFix failed', err);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="mx-auto max-w-[760px] px-7 py-10 font-n-sans">
      <div className="rounded-n-lg border border-n-border-subtle bg-n-surface p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-n-md bg-n-violet-soft text-n-violet">
            <Wrench size={20} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h3 className="m-0 text-[15px] font-semibold text-n-fg">
              {t('fixTab.title', { defaultValue: 'Lance un Fix sur ce skill' })}
            </h3>
            <p className="mt-1.5 text-[13px] leading-snug text-n-muted">
              {t('fixTab.intro', {
                defaultValue:
                  'Le fix s\'appuie sur l\'audit le plus récent et les évals existantes. Il travaille sur une copie sandbox',
              })}{' '}
              (<span className="font-n-mono text-n-fg">tmp_skill</span>),{' '}
              {t('fixTab.introCont', {
                defaultValue: 'itère, et déploie au "Finish".',
              })}
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!onOpenRunTab || isLaunching || !!activeFix}
                onClick={handleLaunch}
                title={
                  activeFix
                    ? t('fixAlreadyRunning', {
                        defaultValue: 'A fix is already running on this skill.',
                      })
                    : undefined
                }
                className={
                  'inline-flex h-8 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[12px] text-n-accent ' +
                  (onOpenRunTab && !isLaunching && !activeFix
                    ? 'hover:bg-n-accent-soft'
                    : 'opacity-60')
                }
              >
                {isLaunching ? (
                  <RefreshCw size={12} strokeWidth={2.25} className="animate-spin" />
                ) : (
                  <Play size={12} strokeWidth={2.25} />
                )}
                {isLaunching
                  ? t('starting', { defaultValue: 'Starting…' })
                  : activeFix
                    ? t('fixRunning', { defaultValue: 'Fix running' })
                    : t('fixTab.run', { defaultValue: 'Lancer le fix' })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Stable string key derived from a `SkillTabIdentity` — used as a
 *  dependency value in `useEffect` so we re-run on identity change. */
function identityKeyOf(identity: SkillTabIdentity): string {
  switch (identity.scope) {
    case 'project':
      return `project:${identity.provider ?? 'claude'}:${identity.projectId}:${identity.skillName}`;
    case 'plugin':
      return `plugin:${identity.marketplaceName}:${identity.pluginName}:${identity.skillName}`;
    case 'claude-global':
      return `claude-global:${identity.skillName}`;
    case 'nakiros-bundled':
      return `nakiros-bundled:${identity.skillName}`;
  }
}

/** Short human label for the breadcrumb when `skill.skillPath` is
 *  not yet loaded (ex: 'global skill', 'plugin · stripe/charge'). */
function scopeLabel(identity: SkillTabIdentity): string {
  switch (identity.scope) {
    case 'project':
      return 'project skill';
    case 'claude-global':
      return 'global skill';
    case 'plugin':
      return `plugin · ${identity.marketplaceName}/${identity.pluginName}`;
    case 'nakiros-bundled':
      return 'nakiros bundled';
  }
}

/**
 * Best-effort score extraction from an audit Markdown report. Looks
 * for patterns like `Score: 22/23`, `**Score:** 22 / 23`, `Score :
 * 22/23` in the first ~3 KB of the report. Returns `null` when no
 * recognisable score is found — the caller falls back to the empty
 * ScoreRing state.
 */
function parseAuditScore(content: string | null): AuditScore | null {
  if (!content) return null;
  const head = content.slice(0, 3000);
  const match = head.match(/score\s*[:=]?\s*\*{0,2}\s*(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}
