import { useEffect, useMemo, useState } from 'react';
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
import type {
  AgentRunKind,
  AuditCheckOutcome,
  AuditCheckSeverity,
  AuditManifest,
  AuditRun,
  SkillDiffEntry,
} from '@nakiros/shared';

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

function AuditPanel({ run }: { run: AuditRun; reportContent: string | null }) {
  const { t } = useTranslation('runs');
  const manifest = run.manifest ?? null;
  const results = run.checkResults ?? [];

  const sectionStats = useMemo(() => computeSectionStats(manifest, results), [manifest, results]);
  const liveFindings = useMemo(() => computeLiveFindings(manifest, results), [manifest, results]);

  const total = manifest?.totalChecks ?? 0;
  const done = results.length;
  const remaining = Math.max(0, total - done);

  return (
    <SidePanel
      icon={ShieldCheck}
      title={t('panels.audit.title', { defaultValue: 'Audit' })}
      tone="info"
    >
      <PanelSection label={t('panels.audit.scoreInProgress', { defaultValue: 'Score en construction' })}>
        {manifest ? (
          <div className="flex items-center gap-3.5 rounded-n-lg border border-n-border-subtle bg-n-canvas px-3.5 py-3.5">
            <ScoreRing value={done} max={total} size={56} />
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-n-fg">
                {t('panels.audit.checksDone', {
                  count: done,
                  defaultValue: '{{count}} checks done',
                })}
              </div>
              <div className="mt-0.5 text-[11.5px] text-n-muted">
                {t('panels.audit.checksRemaining', {
                  count: remaining,
                  defaultValue: '{{count}} remaining',
                })}
              </div>
            </div>
          </div>
        ) : (
          <span className="font-n-mono text-[11px] leading-snug text-n-faint">
            {t('panels.audit.manifestPending', {
              defaultValue: 'Waiting for the agent to publish the audit manifest…',
            })}
          </span>
        )}
      </PanelSection>

      {manifest && sectionStats.length > 0 && (
        <PanelSection label={t('panels.audit.sections', { defaultValue: 'Sections' })}>
          <div className="grid gap-1.5">
            {sectionStats.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 text-[12px]"
              >
                <span
                  className={
                    'h-2 w-2 flex-shrink-0 rounded-full ' +
                    (s.state === 'running' ? 'n-pulse' : '')
                  }
                  style={{
                    background:
                      s.state === 'done'
                        ? 'var(--n-healthy)'
                        : s.state === 'running'
                          ? 'var(--n-accent)'
                          : 'var(--n-fg-faint)',
                  }}
                />
                <span className="flex-1 font-medium text-n-fg">{s.label}</span>
                <span className="font-n-mono tabular-nums text-n-muted">
                  {s.done}/{s.total}
                </span>
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      {manifest && (
        <PanelSection
          label={t('panels.audit.findingsLive', { defaultValue: 'Findings live' })}
        >
          {liveFindings.length === 0 ? (
            <span className="font-n-mono text-[11px] leading-snug text-n-faint">
              {t('panels.audit.noFindings', {
                defaultValue: 'No findings yet — every evaluated check has passed.',
              })}
            </span>
          ) : (
            <div className="flex flex-col gap-1.5">
              {liveFindings.map((f) => {
                const tone =
                  f.severity === 'critical' ? 'critical' : f.severity === 'warn' ? 'watch' : 'info';
                return (
                  <div
                    key={f.checkId}
                    className="rounded-[5px] border border-n-border-subtle bg-n-canvas px-2.5 py-2 text-[11.5px]"
                    style={{ borderLeft: `2px solid var(--n-${tone})` }}
                  >
                    <div
                      className="font-n-mono text-[10px] font-semibold tracking-[0.4px]"
                      style={{ color: `var(--n-${tone})` }}
                    >
                      {f.findingCode}
                    </div>
                    <div className="mt-0.5 text-n-fg">{f.text}</div>
                  </div>
                );
              })}
            </div>
          )}
        </PanelSection>
      )}
    </SidePanel>
  );
}

// ── Audit helpers ──────────────────────────────────────────────────────────

interface SectionStat {
  id: string;
  label: string;
  total: number;
  done: number;
  state: 'pending' | 'running' | 'done';
}

function computeSectionStats(
  manifest: AuditManifest | null,
  results: AuditCheckOutcome[],
): SectionStat[] {
  if (!manifest) return [];
  const doneByCheck = new Set(results.map((r) => r.checkId));
  return manifest.sections.map((section) => {
    const total = section.checks.length;
    const done = section.checks.filter((id) => doneByCheck.has(id)).length;
    const state: SectionStat['state'] = done === 0 ? 'pending' : done < total ? 'running' : 'done';
    return { id: section.id, label: section.label, total, done, state };
  });
}

interface LiveFinding {
  checkId: string;
  findingCode: string;
  text: string;
  severity: AuditCheckSeverity;
}

function computeLiveFindings(
  manifest: AuditManifest | null,
  results: AuditCheckOutcome[],
): LiveFinding[] {
  if (!manifest) return [];
  const specBy = new Map(manifest.checks.map((c) => [c.id, c]));
  const sevWeight: Record<AuditCheckSeverity, number> = { critical: 0, warn: 1, info: 2 };
  const out: LiveFinding[] = [];
  for (const r of results) {
    if (r.result !== 'fail') continue;
    const spec = specBy.get(r.checkId);
    if (!spec) continue;
    out.push({
      checkId: r.checkId,
      findingCode: spec.findingCode,
      text: r.detail || spec.label,
      severity: spec.severityIfFail,
    });
  }
  out.sort((a, b) => sevWeight[a.severity] - sevWeight[b.severity]);
  return out;
}

function ScoreRing({ value, max, size }: { value: number; max: number; size: number }) {
  const pct = max > 0 ? value / max : 0;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--n-border-subtle)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--n-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="font-n-mono fill-n-fg"
        fontSize={size * 0.32}
        fontWeight={600}
      >
        {value}
      </text>
    </svg>
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

