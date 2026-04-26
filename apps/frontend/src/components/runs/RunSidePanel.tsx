import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle,
  FileCode2,
  FlaskConical,
  Folder,
  Plus,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AgentRunKind, AuditRun, SkillDiffEntry } from '@nakiros/shared';

interface RunSidePanelProps {
  kind: AgentRunKind;
  run: AuditRun;
  /** Audit-only — markdown content of the final report when available. */
  reportContent: string | null;
}

/**
 * Right-side panel of the RunScreen — its contents change based on
 * the run kind, mirroring `AuditSidePanel` / `FixSidePanel` /
 * `EvalSidePanel` from the new-design mockup
 * (`apps/Nakiros-new-design/screens-runs.jsx:303-513`).
 *
 * For PR9a we wire audit / fix / create. Audit shows the parsed
 * score (best-effort regex on the report markdown), the status
 * snapshot and the report file link. Fix lists the in-progress
 * sandbox file diff via `listFixDiff(runId)` and surfaces the
 * sandbox path. Create is intentionally lightweight — it just
 * exposes the skill name and the workdir target.
 *
 * Eval / analyze-convo are deferred to PR9b/c. When they arrive,
 * they get their own dedicated panels (eval queue, conversation
 * timeline insights, etc.).
 */
export default function RunSidePanel({ kind, run, reportContent }: RunSidePanelProps) {
  if (kind === 'audit') return <AuditPanel run={run} reportContent={reportContent} />;
  if (kind === 'fix') return <FixPanel run={run} />;
  if (kind === 'create') return <CreatePanel run={run} />;
  return <FallbackPanel kind={kind} />;
}

// ── Audit ──────────────────────────────────────────────────────────────────

function AuditPanel({ run, reportContent }: { run: AuditRun; reportContent: string | null }) {
  const { t } = useTranslation('runs');
  const score = parseScoreFromReport(reportContent);

  return (
    <SidePanel icon={ShieldCheck} title={t('panels.audit.title', { defaultValue: 'Audit' })} tone="info">
      <PanelSection label={t('panels.audit.target', { defaultValue: 'Skill audited' })}>
        <PathRow value={`${run.workdir}/SKILL.md`} />
      </PanelSection>

      <PanelSection label={t('panels.audit.score', { defaultValue: 'Score' })}>
        {score ? (
          <div className="flex items-baseline gap-2">
            <span
              className="font-n-mono text-[28px] font-medium leading-none tabular-nums"
              style={{ color: scoreColor(score.value, score.max) }}
            >
              {score.value}
            </span>
            <span className="font-n-mono text-[13px] text-n-faint">/ {score.max}</span>
          </div>
        ) : (
          <span className="font-n-mono text-[12px] text-n-faint">
            {t('panels.audit.scorePending', { defaultValue: 'Score available once the run completes.' })}
          </span>
        )}
      </PanelSection>

      {run.reportPath && (
        <PanelSection label={t('panels.audit.report', { defaultValue: 'Report' })}>
          <PathRow value={run.reportPath} />
        </PanelSection>
      )}

      <PanelSection label={t('panels.audit.notice', { defaultValue: 'Live findings' })}>
        <div className="flex items-start gap-2 rounded-n-md border border-dashed border-n-border-default bg-n-canvas px-3 py-2.5">
          <AlertCircle size={12} strokeWidth={2.25} className="mt-0.5 flex-shrink-0 text-n-faint" />
          <span className="font-n-mono text-[11px] leading-snug text-n-faint">
            {t('panels.audit.liveHint', {
              defaultValue:
                'Structured findings are surfaced once the runner emits typed events. Until then, see the report below.',
            })}
          </span>
        </div>
      </PanelSection>
    </SidePanel>
  );
}

// ── Fix ────────────────────────────────────────────────────────────────────

function FixPanel({ run }: { run: AuditRun }) {
  const { t } = useTranslation('runs');
  const [diff, setDiff] = useState<SkillDiffEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDiff(null);
    void window.nakiros
      .listFixDiff(run.runId)
      .then((entries) => {
        if (cancelled) return;
        setDiff(entries);
      })
      .catch(() => {
        if (cancelled) return;
        setDiff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [run.runId, run.status]);

  return (
    <SidePanel icon={Wrench} title={t('panels.fix.title', { defaultValue: 'Fix sandbox' })} tone="violet">
      <PanelSection label={t('panels.fix.sandbox', { defaultValue: 'Sandbox' })}>
        <PathRow value={run.workdir} />
      </PanelSection>

      <PanelSection
        label={t('panels.fix.changes', { defaultValue: 'Changes' })}
        right={
          diff !== null ? (
            <span className="font-n-mono text-[10.5px] text-n-faint">
              {diff.length} file{diff.length === 1 ? '' : 's'}
            </span>
          ) : null
        }
      >
        {diff === null ? (
          <span className="font-n-mono text-[11px] text-n-faint">
            {t('common:loading', { defaultValue: 'Loading…' })}
          </span>
        ) : diff.length === 0 ? (
          <span className="font-n-mono text-[11px] text-n-faint">
            {t('panels.fix.empty', { defaultValue: 'No file modified yet.' })}
          </span>
        ) : (
          <ul className="space-y-1">
            {diff.map((entry) => (
              <DiffEntryRow key={entry.relativePath} entry={entry} />
            ))}
          </ul>
        )}
      </PanelSection>

      {run.status === 'completed' && (
        <PanelSection label={t('panels.fix.next', { defaultValue: 'Next step' })}>
          <div className="flex items-start gap-2 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2.5">
            <CheckCircle size={12} strokeWidth={2.25} className="mt-0.5 flex-shrink-0 text-n-accent" />
            <span className="text-[11.5px] leading-snug text-n-fg">
              {t('panels.fix.deployHint', {
                defaultValue:
                  'Hit "Finish & deploy" to copy the sandbox over the real skill. Cancel keeps the original untouched.',
              })}
            </span>
          </div>
        </PanelSection>
      )}
    </SidePanel>
  );
}

function DiffEntryRow({ entry }: { entry: SkillDiffEntry }) {
  // Derive the change kind from the inOriginal/inModified booleans
  // — the daemon doesn't expose a normalised `changeType` for these
  // snapshot entries (it sits on the per-file payload only).
  const isAdded = !entry.inOriginal && entry.inModified;
  const isDeleted = entry.inOriginal && !entry.inModified;
  const tone = isAdded
    ? 'var(--n-healthy)'
    : isDeleted
      ? 'var(--n-critical)'
      : 'var(--n-accent)';
  const symbol = isAdded ? '+' : isDeleted ? '−' : '~';
  return (
    <li className="flex items-center gap-2 rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1.5 font-n-mono text-[11px]">
      <span className="w-3 flex-shrink-0 text-center" style={{ color: tone }}>
        {symbol}
      </span>
      <FileCode2 size={11} strokeWidth={2} className="flex-shrink-0 text-n-subtle" />
      <span className="min-w-0 flex-1 truncate text-n-fg" title={entry.relativePath}>
        {entry.relativePath}
      </span>
    </li>
  );
}

// ── Create ─────────────────────────────────────────────────────────────────

function CreatePanel({ run }: { run: AuditRun }) {
  const { t } = useTranslation('runs');
  return (
    <SidePanel icon={Plus} title={t('panels.create.title', { defaultValue: 'Skill creation' })} tone="healthy">
      <PanelSection label={t('panels.create.skill', { defaultValue: 'Skill' })}>
        <span className="font-n-mono text-[12px] text-n-fg">{run.skillName}</span>
      </PanelSection>
      <PanelSection label={t('panels.create.workdir', { defaultValue: 'Sandbox' })}>
        <PathRow value={run.workdir} />
      </PanelSection>
      <PanelSection label={t('panels.create.notice', { defaultValue: 'Note' })}>
        <span className="font-n-mono text-[11px] leading-snug text-n-faint">
          {t('panels.create.body', {
            defaultValue:
              'The agent drafts the skill in the sandbox first. Hit Finish to copy it under .claude/skills/.',
          })}
        </span>
      </PanelSection>
    </SidePanel>
  );
}

// ── Fallback ───────────────────────────────────────────────────────────────

function FallbackPanel({ kind }: { kind: AgentRunKind }) {
  const { t } = useTranslation('runs');
  return (
    <SidePanel icon={FlaskConical} title={kind} tone="accent">
      <PanelSection label={t('panels.fallback.label', { defaultValue: 'Coming soon' })}>
        <span className="font-n-mono text-[11px] leading-snug text-n-faint">
          {t('panels.fallback.body', {
            defaultValue: 'A dedicated side panel for this kind is shipped in a follow-up PR.',
          })}
        </span>
      </PanelSection>
    </SidePanel>
  );
}

// ── Layout primitives ──────────────────────────────────────────────────────

function SidePanel({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone: 'info' | 'accent' | 'violet' | 'healthy';
  children: React.ReactNode;
}) {
  const toneVar = `var(--n-${tone})`;
  return (
    <aside className="flex w-[320px] flex-shrink-0 flex-col overflow-hidden border-l border-n-border-subtle bg-n-surface">
      <header className="flex items-center gap-2.5 border-b border-n-border-subtle px-4 py-3">
        <span
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs"
          style={{ background: `${toneVar}1a`, color: toneVar }}
        >
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="font-n-mono text-[12px] font-medium uppercase tracking-[0.6px] text-n-fg">
          {title}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">{children}</div>
      </div>
    </aside>
  );
}

function PanelSection({
  label,
  right,
  children,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between font-n-mono text-[10px] uppercase tracking-[1.2px] text-n-subtle">
        <span>{label}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

function PathRow({ value }: { value: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-1.5"
      title={value}
    >
      <Folder size={11} strokeWidth={2} className="flex-shrink-0 text-n-subtle" />
      <span className="min-w-0 flex-1 truncate font-n-mono text-[11px] text-n-muted">{value}</span>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Best-effort score extraction from an audit Markdown report.
 * Same pattern used by `SkillDetailScreen` so the two views stay
 * in sync on what counts as a recognisable "Score: X/Y" line.
 */
function parseScoreFromReport(content: string | null): { value: number; max: number } | null {
  if (!content) return null;
  const head = content.slice(0, 3000);
  const match = head.match(/score\s*[:=]?\s*\*{0,2}\s*(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return { value, max };
}

function scoreColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio >= 0.85) return 'var(--n-healthy)';
  if (ratio >= 0.6) return 'var(--n-accent)';
  if (ratio >= 0.4) return 'var(--n-watch)';
  return 'var(--n-critical)';
}
