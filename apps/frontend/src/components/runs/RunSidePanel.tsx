import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  CheckCircle,
  Columns2,
  FlaskConical,
  Folder,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type {
  AgentRunKind,
  AuditCheckOutcome,
  AuditCheckSeverity,
  AuditManifest,
  AuditRun,
  FixTarget,
  SkillDiffEntry,
} from '@nakiros/shared';

interface RunSidePanelProps {
  kind: AgentRunKind;
  run: AuditRun;
  /** Audit-only — markdown content of the final report when available. */
  reportContent: string | null;
  /**
   * Fix/create-only — discard the sandbox without deploying. The host
   * (`RunScreen`) handles the confirm dialog, the daemon stop, store
   * dismissal and tab close. Omitted on audit (no sandbox to discard).
   */
  onReject?: () => void;
  /** True while a reject is in flight — disables the button. */
  isRejecting?: boolean;
  /**
   * Fix/create-only — sync the sandbox back to the real skill, promote
   * the last fix-temp iteration to `kind: skill`, then tear down the
   * tmp workdir + the matching `~/.claude/projects/` entry. Surfaced
   * when the run is in `waiting_for_input` or `completed` (the natural
   * checkpoints where the user has reviewed the agent's work).
   */
  onFinish?: () => void;
  /** True while finish is in flight — disables both Apply and Reject to
   *  avoid racing the cleanup. */
  isFinishing?: boolean;
  /**
   * Fix-only — currently active file in the diff viewer (replaces the chat
   * in the main panel). When non-null, the matching row in the sandbox
   * card is highlighted.
   */
  selectedDiffFile?: string | null;
  /** Click handler for a sandbox file row — toggles the diff viewer. */
  onSelectDiffFile?(relativePath: string | null): void;
  /**
   * Fix-only — kick off `runFixEvalsInTemp` and open the resulting eval
   * batch as a new tab. Host handles the IPC + tab opening; the panel just
   * surfaces the button.
   */
  onLaunchEval?: () => void;
  /** True while the eval launch is in flight. */
  isLaunchingEval?: boolean;
  /**
   * What the run operates on, in user-facing prose (`'skill'`, `'CLAUDE.md'`,
   * `'conversation'`, `'rule'`). Drives the wording of the deploy / discard
   * buttons so a CLAUDE.md or rules fix run doesn't display "Apply & deploy".
   * Defaults to `'skill'`.
   */
  targetNoun?: 'skill' | 'CLAUDE.md' | 'conversation' | 'rule' | 'subagent';
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
export default function RunSidePanel({
  kind,
  run,
  reportContent,
  onReject,
  isRejecting,
  onFinish,
  isFinishing,
  selectedDiffFile,
  onSelectDiffFile,
  onLaunchEval,
  isLaunchingEval,
  targetNoun = 'skill',
}: RunSidePanelProps) {
  if (kind === 'audit') return <AuditPanel run={run} reportContent={reportContent} />;
  if (kind === 'fix' || kind === 'create')
    return (
      <FixPanel
        kind={kind}
        run={run}
        onReject={onReject}
        isRejecting={isRejecting}
        onFinish={onFinish}
        isFinishing={isFinishing}
        selectedDiffFile={selectedDiffFile ?? null}
        onSelectDiffFile={onSelectDiffFile}
        onLaunchEval={onLaunchEval}
        isLaunchingEval={isLaunchingEval}
        targetNoun={targetNoun}
      />
    );
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

function FixPanel({
  kind,
  run,
  onReject,
  isRejecting,
  onFinish,
  isFinishing,
  selectedDiffFile,
  onSelectDiffFile,
  onLaunchEval,
  isLaunchingEval,
  targetNoun,
}: {
  kind: 'fix' | 'create';
  run: AuditRun;
  onReject?: () => void;
  isRejecting?: boolean;
  onFinish?: () => void;
  isFinishing?: boolean;
  selectedDiffFile: string | null;
  onSelectDiffFile?(relativePath: string | null): void;
  onLaunchEval?: () => void;
  isLaunchingEval?: boolean;
  targetNoun: 'skill' | 'CLAUDE.md' | 'conversation' | 'rule' | 'subagent';
}) {
  const { t } = useTranslation('runs');
  const [diff, setDiff] = useState<SkillDiffEntry[] | null>(null);

  // Event-driven refresh: refetch on mount, and again every time a
  // Write/Edit tool_use lands on the run stream. Fix events come from
  // `fix:event`, create events from `create:event` — the registry is
  // shared but the broadcast channel is per-mode.
  useEffect(() => {
    let cancelled = false;
    const listDiff =
      kind === 'create' ? window.nakiros.listCreateDiff : window.nakiros.listFixDiff;
    const fetchDiff = () =>
      listDiff(run.runId)
        .then((entries) => {
          if (!cancelled) setDiff(entries);
        })
        .catch(() => {
          if (!cancelled) setDiff([]);
        });

    void fetchDiff();

    const subscribe =
      kind === 'create' ? window.nakiros.onCreateEvent : window.nakiros.onFixEvent;
    const unsubscribe = subscribe((envelope) => {
      const e = envelope as { runId: string; event: { type: string; name?: string } };
      if (e.runId !== run.runId) return;
      if (e.event.type === 'tool' && isWriteTool(e.event.name)) {
        void fetchDiff();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [kind, run.runId, run.status]);

  // Targets the agent registered in `outputs/fix-targets.jsonl` — the runner
  // tails the file and reduces it into `run.targets` (last-line-wins per id).
  const targets = run.targets ?? [];
  const targetsDone = targets.filter((t) => t.status === 'done').length;

  const isClaudemd = targetNoun === 'CLAUDE.md';
  const isRules = targetNoun === 'rule';
  // Both CLAUDE.md and rules runs edit the target file directly — no sandbox deploy.
  const isDirectEdit = isClaudemd || isRules;
  const panelTitle = isDirectEdit
    ? kind === 'create'
      ? t('panels.create.titleClaudemd', { defaultValue: 'Création CLAUDE.md' })
      : t('panels.fix.titleClaudemd', { defaultValue: 'Fix CLAUDE.md' })
    : kind === 'create'
      ? t('panels.create.title', { defaultValue: 'Skill creation' })
      : t('panels.fix.title', { defaultValue: 'Fix sandbox' });
  const panelIcon = kind === 'create' ? Plus : Wrench;
  const panelTone = kind === 'create' ? 'healthy' : 'violet';

  // Wording overrides for CLAUDE.md / rules targets — the bundled expert writes
  // to the user's file directly, there's no sandbox to deploy or discard.
  const labels = isDirectEdit
    ? {
        sandboxLabel: t('panels.fix.workdirClaudemd', { defaultValue: 'Espace de travail' }),
        deployHint: t('panels.fix.deployHintClaudemd', {
          defaultValue:
            'Le CLAUDE.md a été mis à jour directement. Clique « Terminer » pour clore le run.',
        }),
        applyLabel: t('panels.fix.applyLabelClaudemd', { defaultValue: 'Terminer' }),
        applyTooltip: t('panels.fix.applyTooltipClaudemd', {
          defaultValue: 'Marquer le run comme terminé. Le CLAUDE.md reste tel quel.',
        }),
        applyText: t('panels.fix.applyClaudemd', { defaultValue: 'Terminer' }),
        applyingText: t('panels.fix.applyingClaudemd', { defaultValue: 'En cours…' }),
        discardLabel: t('panels.fix.discardLabelClaudemd', { defaultValue: 'Stopper le run' }),
        discardingText: t('panels.fix.discardingClaudemd', { defaultValue: 'Arrêt…' }),
      }
    : {
        sandboxLabel: t('panels.fix.sandboxTmpSkill', { defaultValue: 'Sandbox · tmp_skill' }),
        deployHint: t('panels.fix.deployHint', {
          defaultValue:
            'Hit "Finish & deploy" to copy the sandbox over the real skill. Cancel keeps the original untouched.',
        }),
        applyLabel: t('panels.fix.applyLabel', { defaultValue: 'Apply to skill' }),
        applyTooltip: t('panels.fix.applyTooltip', {
          defaultValue:
            'Sync the sandbox to the real skill, promote the latest fix-temp eval iteration, and clean up the sandbox.',
        }),
        applyText: t('panels.fix.apply', { defaultValue: 'Apply & deploy' }),
        applyingText: t('panels.fix.applying', { defaultValue: 'Applying…' }),
        discardLabel: t('panels.fix.discardLabel', { defaultValue: 'Discard sandbox' }),
        discardingText: t('panels.fix.discarding', { defaultValue: 'Discarding…' }),
      };

  return (
    <SidePanel icon={panelIcon} title={panelTitle} tone={panelTone}>
      <PanelSection label={labels.sandboxLabel}>
        <div className="rounded-n-lg border border-n-border-subtle bg-n-canvas px-3 py-2.5">
          <div
            className="truncate font-n-mono text-[11.5px] text-n-muted"
            title={run.workdir}
          >
            {prettifyHomePath(run.workdir)}
          </div>
          <div className="mt-2.5 flex flex-col gap-1">
            {diff === null ? (
              <span className="font-n-mono text-[11px] text-n-faint">
                {t('common:loading', { defaultValue: 'Loading…' })}
              </span>
            ) : diff.length === 0 ? (
              <span className="font-n-mono text-[11px] text-n-faint">
                {t('panels.fix.empty', { defaultValue: 'No file modified yet.' })}
              </span>
            ) : (
              diff.map((entry) => (
                <DiffEntryRow
                  key={entry.relativePath}
                  entry={entry}
                  active={entry.relativePath === selectedDiffFile}
                  onSelect={
                    onSelectDiffFile
                      ? () =>
                          onSelectDiffFile(
                            entry.relativePath === selectedDiffFile
                              ? null
                              : entry.relativePath,
                          )
                      : undefined
                  }
                />
              ))
            )}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        label={t('panels.fix.targets', { defaultValue: 'Targets from audit' })}
        right={
          targets.length > 0 ? (
            <span className="font-n-mono text-[10.5px] text-n-faint">
              {targetsDone}/{targets.length}
            </span>
          ) : null
        }
      >
        {targets.length === 0 ? (
          <span className="font-n-mono text-[11px] leading-snug text-n-faint">
            {t('panels.fix.targetsEmpty', {
              defaultValue:
                'The agent has not registered targets yet — they appear once the audit signals are read.',
            })}
          </span>
        ) : (
          <ul className="grid gap-1.5">
            {targets.map((target) => (
              <TargetRow key={target.id} target={target} />
            ))}
          </ul>
        )}
      </PanelSection>

      {run.status === 'completed' && (
        <PanelSection label={t('panels.fix.next', { defaultValue: 'Next step' })}>
          <div className="flex items-start gap-2 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2.5">
            <CheckCircle size={12} strokeWidth={2.25} className="mt-0.5 flex-shrink-0 text-n-accent" />
            <span className="text-[11.5px] leading-snug text-n-fg">{labels.deployHint}</span>
          </div>
        </PanelSection>
      )}

      {onLaunchEval &&
        (run.status === 'completed' || run.status === 'waiting_for_input') &&
        (diff ?? []).some((e) => e.relativePath === 'evals/evals.json') && (
          <PanelSection
            label={t('panels.fix.evalLabel', { defaultValue: 'Test the sandbox' })}
          >
            <button
              type="button"
              onClick={onLaunchEval}
              disabled={isLaunchingEval}
              className="flex w-full items-center justify-center gap-2 rounded-n-md border border-n-accent/40 bg-n-accent-soft px-3 py-2 text-[12px] font-medium text-n-accent transition-colors hover:bg-n-accent-soft/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLaunchingEval ? (
                <Loader2 size={13} strokeWidth={2.25} className="animate-spin" />
              ) : (
                <Play size={13} strokeWidth={2.25} />
              )}
              {isLaunchingEval
                ? t('panels.fix.evalLaunching', { defaultValue: 'Launching evals…' })
                : t('panels.fix.evalRun', { defaultValue: 'Run evals on sandbox' })}
            </button>
          </PanelSection>
        )}

      {onFinish &&
        (run.status === 'completed' || run.status === 'waiting_for_input') && (
          <PanelSection label={labels.applyLabel}>
            <button
              type="button"
              onClick={onFinish}
              disabled={isFinishing || isRejecting}
              className="flex w-full items-center justify-center gap-2 rounded-n-md border border-n-healthy/40 bg-n-healthy-soft px-3 py-2 text-[12px] font-medium text-n-healthy transition-colors hover:bg-n-healthy-soft/80 disabled:cursor-not-allowed disabled:opacity-60"
              title={labels.applyTooltip}
            >
              {isFinishing ? (
                <Loader2 size={13} strokeWidth={2.25} className="animate-spin" />
              ) : (
                <Check size={13} strokeWidth={2.25} />
              )}
              {isFinishing ? labels.applyingText : labels.applyText}
            </button>
          </PanelSection>
        )}

      {onReject &&
        (run.status === 'completed' || run.status === 'waiting_for_input') && (
          <PanelSection label={labels.discardLabel}>
            <button
              type="button"
              onClick={onReject}
              disabled={isRejecting || isFinishing}
              className="flex w-full items-center justify-center gap-2 rounded-n-md border border-n-critical/40 bg-n-critical-soft px-3 py-2 text-[12px] font-medium text-n-critical transition-colors hover:bg-n-critical-soft/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRejecting ? (
                <Loader2 size={13} strokeWidth={2.25} className="animate-spin" />
              ) : (
                <Trash2 size={13} strokeWidth={2.25} />
              )}
              {isRejecting
                ? labels.discardingText
                : isDirectEdit
                  ? t('panels.fix.discardClaudemd', { defaultValue: 'Stopper' })
                  : t('panels.fix.discard', { defaultValue: 'Reject changes' })}
            </button>
          </PanelSection>
        )}
    </SidePanel>
  );
}

function TargetRow({ target }: { target: FixTarget }) {
  const done = target.status === 'done';
  return (
    <li
      className="flex items-start gap-2.5 rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-2 text-[12px]"
      title={target.source}
    >
      {done ? (
        <Check size={13} strokeWidth={2.25} className="mt-0.5 flex-shrink-0 text-n-healthy" />
      ) : (
        <span className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border border-n-faint" />
      )}
      <span
        className={
          'min-w-0 flex-1 whitespace-normal break-words leading-snug ' +
          (done ? 'text-n-muted line-through' : 'text-n-fg')
        }
      >
        {target.title}
      </span>
    </li>
  );
}

function DiffEntryRow({
  entry,
  active,
  onSelect,
}: {
  entry: SkillDiffEntry;
  active: boolean;
  onSelect?: () => void;
}) {
  const { t } = useTranslation('runs');
  const isAdded = !entry.inOriginal && entry.inModified;
  const isDeleted = entry.inOriginal && !entry.inModified;

  // Right-side stat — mirrors the mockup: `+12 −3` for modified files,
  // `new` (green) for additions, `deleted` (red) for removals.
  let rightContent: React.ReactNode;
  if (isAdded) {
    rightContent = (
      <span className="flex-shrink-0 text-[11px] text-n-healthy">
        {t('panels.fix.diff.new', { defaultValue: 'new' })}
      </span>
    );
  } else if (isDeleted) {
    rightContent = (
      <span className="flex-shrink-0 text-[11px] text-n-critical">
        {t('panels.fix.diff.deleted', { defaultValue: 'deleted' })}
      </span>
    );
  } else {
    rightContent = (
      <span className="flex-shrink-0 font-n-mono text-[11px] tabular-nums text-n-muted">
        +{entry.addedLines} −{entry.removedLines}
      </span>
    );
  }

  const inner = (
    <>
      <Columns2 size={12} strokeWidth={2} className="flex-shrink-0 text-n-violet" />
      <span className="min-w-0 flex-1 truncate text-n-fg" title={entry.relativePath}>
        {entry.relativePath}
      </span>
      {rightContent}
    </>
  );

  if (!onSelect) {
    return <div className="flex items-center gap-2 font-n-mono text-[12px]">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'flex w-full items-center gap-2 rounded-n-xs px-1.5 py-0.5 text-left font-n-mono text-[12px] transition-colors ' +
        (active
          ? 'bg-n-violet-soft'
          : 'hover:bg-n-sunken')
      }
    >
      {inner}
    </button>
  );
}

/**
 * Tool names whose execution mutates the sandbox tree — the only events we
 * care about for refreshing the file listing. Stays in sync with the SDK's
 * built-in editor tools.
 */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
function isWriteTool(name: string | undefined): boolean {
  return name !== undefined && WRITE_TOOLS.has(name);
}

/**
 * Render `~/path/...` when the absolute path lives under the user's home.
 * Mirrors the mockup which shows `~/.nakiros/tmp/skill-1729/`. We can't
 * read `os.homedir()` in the browser, so we infer it from the prefix
 * heuristically (everything up to `/.nakiros/` is the home).
 */
function prettifyHomePath(absPath: string): string {
  const marker = '/.nakiros/';
  const idx = absPath.indexOf(marker);
  if (idx >= 0) return '~' + absPath.slice(idx);
  return absPath;
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

