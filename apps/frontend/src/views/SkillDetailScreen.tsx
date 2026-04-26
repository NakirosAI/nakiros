import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  FileText,
  FlaskConical,
  Layers,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { AuditHistoryEntry, Project, Skill } from '@nakiros/shared';
import ScoreRing from '../components/viz/ScoreRing';
import AuditHistoryPicker from '../components/skill/AuditHistoryPicker';
import AuditMarkdownViewer from '../components/skill/AuditMarkdownViewer';

interface Props {
  /** Project owning the skill. */
  project: Project;
  /** Folder name of the skill (matches `Skill.name`). */
  skillName: string;
  /** Activated when the user hits "Back" — returns to the skills list. */
  onBack(): void;
}

type SkillTab = 'audit' | 'evals' | 'fix' | 'files' | 'iters';

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
export default function SkillDetailScreen({ project, skillName, onBack }: Props) {
  const { t } = useTranslation('skills');
  const [skill, setSkill] = useState<Skill | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const [tab, setTab] = useState<SkillTab>('audit');

  useEffect(() => {
    let cancelled = false;
    setSkill(null);
    setSkillError(null);
    window.nakiros
      .listProjectSkills(project.id)
      .then((list) => {
        if (cancelled) return;
        const found = list.find((s) => s.name === skillName);
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
  }, [project.id, skillName, t]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* Breadcrumb header */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-n-border-subtle px-7 py-3.5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 bg-transparent text-[12.5px] text-n-muted hover:text-n-fg"
        >
          <ArrowLeft size={14} strokeWidth={2} /> {t('back', { defaultValue: 'Back' })}
        </button>
        <span className="h-3.5 w-px bg-n-border-subtle" />
        <Sparkles size={16} strokeWidth={2} className="text-n-accent" />
        <strong className="font-n-mono text-[14px] font-medium text-n-fg">{skillName}</strong>
        <span className="font-n-mono text-[11px] text-n-faint">
          /{project.name}/.claude/skills/{skillName}
        </span>
        <span className="flex-1" />
        <div className="flex gap-1.5">
          {/* Audit + Fix actions are wired up in PR5 / PR6 — placeholders here so the layout matches the mockup. */}
          <button
            type="button"
            disabled
            className="inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-border-default bg-transparent px-2.5 font-n-mono text-[11.5px] text-n-muted opacity-60"
          >
            <ShieldCheck size={12} strokeWidth={2} />
            {t('runAudit', { defaultValue: 'Audit' })}
          </button>
          <button
            type="button"
            disabled
            className="inline-flex h-7 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-2.5 font-n-mono text-[11.5px] text-n-accent opacity-60"
          >
            <Wrench size={12} strokeWidth={2} />
            {t('runFix', { defaultValue: 'Fix' })}
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-n-border-subtle px-7">
        <Tab id="audit" label="Audit" icon={<ShieldCheck size={13} strokeWidth={2} />} count={skill?.auditCount} active={tab} setTab={setTab} />
        <Tab id="evals" label="Evals" icon={<FlaskConical size={13} strokeWidth={2} />} count={skill?.evals?.definitions.length} active={tab} setTab={setTab} disabled />
        <Tab id="fix" label="Fix" icon={<Wrench size={13} strokeWidth={2} />} active={tab} setTab={setTab} disabled />
        <Tab id="files" label="Files" icon={<FileText size={13} strokeWidth={2} />} count={skill?.files.length} active={tab} setTab={setTab} disabled />
        <Tab id="iters" label="Iterations" icon={<Layers size={13} strokeWidth={2} />} count={skill?.evals?.iterations.length} active={tab} setTab={setTab} disabled />
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto">
        {skillError && (
          <div className="m-7 rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
            {skillError}
          </div>
        )}
        {!skillError && skill && tab === 'audit' && (
          <AuditTab project={project} skill={skill} />
        )}
        {!skillError && skill && tab !== 'audit' && (
          <ComingSoon tab={tab} />
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

function AuditTab({ project, skill }: { project: Project; skill: Skill }) {
  const { t } = useTranslation('skills');
  const [history, setHistory] = useState<AuditHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditHistoryEntry | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  // Load the audit history for the skill once.
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setHistoryError(null);
    window.nakiros
      .listAuditHistory({ scope: 'project', projectId: project.id, skillName: skill.name })
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
  }, [project.id, skill.name]);

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
              <span className="font-n-mono">.claude/skills/{skill.name}/SKILL.md</span>
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
              disabled
              className="inline-flex h-9 items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 font-n-mono text-[12px] text-n-accent opacity-60"
            >
              <Wrench size={13} strokeWidth={2} />
              {t('auditTab.fixFromAudit', { defaultValue: 'Fix from this audit' })}
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

// ── Coming-soon placeholder for non-audit tabs ─────────────────────────────

function ComingSoon({ tab }: { tab: Exclude<SkillTab, 'audit'> }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-n-lg border border-n-border-default bg-n-surface px-8 py-7 text-center">
        <div className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">{tab}</div>
        <div className="mt-2 text-[15px] text-n-fg">Coming soon</div>
        <div className="mt-1 text-[12.5px] text-n-muted">
          This tab is part of a later phase of the migration.
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
