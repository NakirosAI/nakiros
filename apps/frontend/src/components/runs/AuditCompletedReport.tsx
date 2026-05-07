import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  FlaskConical,
  Play,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AuditCheckSeverity, AuditRun, Skill } from '@nakiros/shared';
import { launchEdit, launchEvalBatch, launchFix, type OpenRunTabCallback } from '../../lib/run-launcher';
import { useActiveFixForSkill } from '../../hooks/useAgentRun';
import type { SkillTabIdentity } from '../../hooks/useTabs';
import { runDisplayContext } from '../../lib/run-display';

interface AuditCompletedReportProps {
  /** Completed audit run — we read `manifest`, `checkResults`, `tokensUsed`, `durationMs`. */
  run: AuditRun;
  /** Markdown content of `audit-report.md`. Currently unused but kept for parity with the old viewer. */
  reportContent: string | null;
  /** Opens the markdown report in the system editor. Hidden when `reportPath` is unset. */
  onOpenReport?: () => void;
  /** Opens a new tab when an action launches a follow-up run (eval / fix). */
  onOpenRunTab?: OpenRunTabCallback;
}

/**
 * Audit completion screen — port of `CompletedReport` (audit branch) in
 * `apps/Nakiros-new-design/screens-runs.jsx:518-715`. Drives off the
 * structured `manifest` + `checkResults` rather than parsing the markdown
 * report, so the numbers stay authoritative even when the report wording
 * drifts.
 *
 * Next-steps actions wired:
 *   - Fix run: `launchFix(identity, openRunTab)`. Disabled while a fix
 *     run is already in flight for this skill (`useActiveFixForSkill`).
 *   - Eval batch: `launchEvalBatch`. Disabled when the skill has no eval
 *     suite defined (`!skill.hasEvals`).
 *   - Open markdown report: forwards to `onOpenReport` (system editor).
 */
export default function AuditCompletedReport({
  run,
  onOpenReport,
  onOpenRunTab,
}: AuditCompletedReportProps) {
  const { t } = useTranslation('runs');
  const stats = useMemo(() => computeStats(run), [run]);
  const findings = useMemo(() => computeFindings(run), [run]);
  const { isClaudemd, isRules, isSubagents, isHooks, isPermissions, isMcp, isOutputStyles } = runDisplayContext('audit', run);
  // Runs targeting a CLAUDE.md, a rule file, a subagent, hooks, permissions, mcp, or an output style have no eval suite concept.
  const hideEval = isClaudemd || isRules || isSubagents || isHooks || isPermissions || isMcp || isOutputStyles;

  // Fetch the skill record once we know the audit is over — drives the
  // "Évaluer le skill" button (enabled iff `skill.hasEvals`). Skipped for
  // CLAUDE.md / rules targets (no eval suite concept).
  const [skill, setSkill] = useState<Skill | null>(null);
  useEffect(() => {
    if (hideEval) return;
    let cancelled = false;
    void fetchSkillForRun(run).then((s) => {
      if (!cancelled) setSkill(s);
    });
    return () => {
      cancelled = true;
    };
  }, [run, hideEval]);
  const [isLaunchingEval, setIsLaunchingEval] = useState(false);
  const [isLaunchingFix, setIsLaunchingFix] = useState(false);
  const [isLaunchingEdit, setIsLaunchingEdit] = useState(false);

  // Memoised so it doesn't re-create the identity object on every render —
  // `useActiveFixForSkill` short-circuits on referential equality.
  const identity = useMemo(() => identityFromRun(run), [run]);
  // Disable the Fix button when a fix run is already in flight for this
  // skill. Mirrors the gating in `EvalRunRecap.handleFixRegression`.
  const activeFix = useActiveFixForSkill(identity);

  const canLaunchEval = Boolean(skill?.hasEvals && onOpenRunTab && !isLaunchingEval);
  async function handleLaunchEval(): Promise<void> {
    if (!skill || !onOpenRunTab || !identity) return;
    setIsLaunchingEval(true);
    try {
      // No `model` — let the daemon use its default. The user can still
      // pick a model from the matrix view if they want to run on a specific one.
      await launchEvalBatch(identity, {}, onOpenRunTab);
    } catch (err) {
      console.error('[audit-completed] launchEvalBatch failed', err);
    } finally {
      setIsLaunchingEval(false);
    }
  }

  const canLaunchFix = Boolean(
    identity && onOpenRunTab && !activeFix && !isLaunchingFix,
  );
  async function handleLaunchFix(): Promise<void> {
    if (!identity || !onOpenRunTab || activeFix) return;
    setIsLaunchingFix(true);
    try {
      await launchFix(identity, onOpenRunTab);
    } catch (err) {
      console.error('[audit-completed] launchFix failed', err);
    } finally {
      setIsLaunchingFix(false);
    }
  }

  // Edit run — only relevant for .claude/ entity targets (hideEval is true).
  const canLaunchEdit = Boolean(hideEval && identity && onOpenRunTab && !isLaunchingEdit);
  async function handleLaunchEdit(): Promise<void> {
    if (!identity || !onOpenRunTab) return;
    setIsLaunchingEdit(true);
    try {
      await launchEdit(identity, onOpenRunTab);
    } catch (err) {
      console.error('[audit-completed] launchEdit failed', err);
    } finally {
      setIsLaunchingEdit(false);
    }
  }

  const heroTone = pickHeroTone(stats);
  const heroToneClass = HERO_TONE_CLASS[heroTone];
  const HeroIcon =
    heroTone === 'good' ? Check : heroTone === 'warn' ? AlertTriangle : XCircle;

  return (
    <div className="flex-1 overflow-y-auto bg-n-canvas px-6 py-8">
      <div className="mx-auto max-w-[920px]">
        {/* Hero card — tone gradué façon EvalRunRecap (good / warn / bad)
            avec downgrade si ≥ 1 finding critique. */}
        <div
          className={
            'mb-[18px] flex items-start gap-3.5 rounded-n-lg border px-4 py-3.5 ' +
            heroToneClass.surface
          }
        >
          <div
            className={
              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-n-md ' +
              heroToneClass.badge
            }
          >
            <HeroIcon size={18} strokeWidth={2.5} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
              {t('audit.completed.eyebrow', {
                defaultValue: 'Audit run completed',
              })}{' '}
              · {formatDuration(run.durationMs)}
            </span>
            <span className="text-[20px] font-semibold text-n-fg">
              {t('audit.completed.headline', {
                value: stats.passed,
                total: stats.total,
                defaultValue: '{{value}}/{{total}} checks passed',
              })}
            </span>
            <span className="text-[12.5px] leading-snug text-n-muted">
              {summaryLine(stats, t, hideEval)}
            </span>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mb-[18px] grid grid-cols-4 gap-2.5">
          <Kpi
            label={t('audit.kpis.checks', { defaultValue: 'Checks' })}
            value={`${stats.passed}/${stats.total}`}
            tone={kpiToneFromHero(heroTone)}
          />
          <Kpi
            label={t('audit.kpis.critical', { defaultValue: 'Critical' })}
            value={String(stats.critical)}
            tone={stats.critical > 0 ? 'critical' : 'fg'}
          />
          <Kpi
            label={t('audit.kpis.warnings', { defaultValue: 'Warnings' })}
            value={String(stats.warnings)}
            tone={stats.warnings > 0 ? 'watch' : 'fg'}
          />
          <Kpi
            label={t('audit.kpis.tokens', { defaultValue: 'Tokens' })}
            value={formatTokens(run.tokensUsed)}
            tone="fg"
          />
        </div>

        {/* Findings list */}
        {findings.length > 0 && (
          <>
            <SectionLabel>
              {t('audit.findings.title', {
                count: findings.length,
                defaultValue: 'Findings · {{count}}',
              })}
            </SectionLabel>
            <div className="mb-[18px] overflow-hidden rounded-n-lg border border-n-border-subtle bg-n-surface">
              {findings.map((f, i) => (
                <FindingRow
                  key={f.checkId}
                  code={f.findingCode}
                  text={f.detail || f.label}
                  severity={f.severity}
                  isLast={i === findings.length - 1}
                />
              ))}
            </div>
          </>
        )}

        {/* Next steps — Fix and Eval wired via `launchFix` / `launchEvalBatch`.
            The Fix button is disabled while a fix run is already in flight
            for this skill; Eval is disabled when the skill has no eval
            suite defined. */}
        <SectionLabel>
          {t('audit.nextSteps.title', { defaultValue: 'Prochaines étapes' })}
        </SectionLabel>
        <div className="flex flex-col gap-1.5">
          <NextStepRow
            icon={Wrench}
            label={t('audit.nextSteps.fix', {
              count: findings.length,
              defaultValue: 'Lancer un Fix run pour corriger les {{count}} findings',
            })}
            primary
            onClick={canLaunchFix ? handleLaunchFix : undefined}
            disabled={!canLaunchFix}
            disabledReason={
              activeFix
                ? hideEval
                  ? t('audit.nextSteps.fixActiveGeneric', {
                      defaultValue: 'Un Fix run est déjà en cours sur cette cible.',
                    })
                  : t('audit.nextSteps.fixActive', {
                      defaultValue: 'Un Fix run est déjà en cours pour ce skill.',
                    })
                : undefined
            }
          />
          {!hideEval && (
            <NextStepRow
              icon={FlaskConical}
              label={
                skill && !skill.hasEvals
                  ? t('audit.nextSteps.evalNoSuite', {
                      defaultValue: 'Évaluer le skill — aucune eval définie',
                    })
                  : t('audit.nextSteps.eval', {
                      defaultValue: 'Évaluer le skill tel quel sur les fixtures',
                    })
              }
              onClick={canLaunchEval ? handleLaunchEval : undefined}
              disabled={!canLaunchEval}
              disabledReason={
                skill && !skill.hasEvals
                  ? t('audit.nextSteps.evalNoSuiteHint', {
                      defaultValue:
                        'Crée une suite d\'évals pour ce skill avant de pouvoir l\'évaluer.',
                    })
                  : undefined
              }
            />
          )}
          <NextStepRow
            icon={FileText}
            label={t('audit.nextSteps.export', {
              defaultValue: 'Exporter le rapport en markdown',
            })}
            onClick={onOpenReport}
            disabled={!onOpenReport}
          />
          {hideEval && (
            <NextStepRow
              icon={Play}
              label={t('audit.report.openInEdit.button', {
                defaultValue: 'Ouvrir une session Edit',
              })}
              subtitle={t('audit.report.openInEdit.subtitle', {
                defaultValue: 'Édition interactive guidée par les findings',
              })}
              onClick={canLaunchEdit ? handleLaunchEdit : undefined}
              disabled={!canLaunchEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'critical' | 'watch' | 'healthy' | 'info' | 'fg';
}) {
  const color = tone === 'fg' ? 'var(--n-fg)' : `var(--n-${tone})`;
  return (
    <div className="rounded-n-lg border border-n-border-subtle bg-n-surface px-3.5 py-3.5">
      <div className="mb-1 font-n-mono text-[9.5px] uppercase tracking-[0.7px] text-n-faint">
        {label}
      </div>
      <div
        className="text-[22px] font-semibold leading-tight tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-n-mono text-[9.5px] uppercase tracking-[0.7px] text-n-faint">
      {children}
    </div>
  );
}

function FindingRow({
  code,
  text,
  severity,
  isLast,
}: {
  code: string;
  text: string;
  severity: AuditCheckSeverity;
  isLast: boolean;
}) {
  const tone = severity === 'critical' ? 'critical' : severity === 'warn' ? 'watch' : 'info';
  return (
    <div
      className={
        'flex items-center gap-3 px-4 py-3 ' + (isLast ? '' : 'border-b border-n-border-subtle')
      }
      style={{ borderLeft: `2px solid var(--n-${tone})` }}
    >
      <span
        className="font-n-mono text-[10.5px] font-semibold uppercase tracking-[0.4px]"
        style={{ color: `var(--n-${tone})`, minWidth: 140 }}
      >
        {code}
      </span>
      <span className="flex-1 text-[12.5px] text-n-fg">{text}</span>
    </div>
  );
}

function NextStepRow({
  icon: Icon,
  label,
  subtitle,
  primary = false,
  disabled = false,
  onClick,
  disabledReason,
}: {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  disabledReason?: string;
}) {
  const baseClass =
    'flex w-full items-center gap-3 rounded-n-md border px-4 py-3 text-left text-[13px] transition-colors';
  const toneClass = primary
    ? 'border-n-accent-line bg-n-accent-soft text-n-fg hover:bg-n-accent-soft'
    : 'border-n-border-subtle bg-n-surface text-n-fg hover:bg-n-canvas';
  const disabledClass = disabled ? ' cursor-not-allowed opacity-60' : '';
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={baseClass + ' ' + toneClass + disabledClass}
    >
      <Icon
        size={14}
        strokeWidth={2}
        className={primary ? 'text-n-accent' : 'text-n-muted'}
      />
      <span className="flex-1">
        {label}
        {subtitle && (
          <span className="mt-0.5 block font-n-mono text-[11px] text-n-muted">{subtitle}</span>
        )}
      </span>
      <ExternalLink
        size={12}
        strokeWidth={2}
        className={primary ? 'text-n-accent' : 'text-n-muted'}
      />
    </button>
  );
}

// ── Stats derivation ──────────────────────────────────────────────────────

interface AuditStats {
  total: number;
  passed: number;
  failed: number;
  critical: number;
  warnings: number;
}

function computeStats(run: AuditRun): AuditStats {
  const total = run.manifest?.totalChecks ?? run.checkResults?.length ?? 0;
  const results = run.checkResults ?? [];
  // `na` counts as a pass per the manifest contract (conditional checks).
  const passed = results.filter((r) => r.result === 'pass' || r.result === 'na').length;
  const failed = results.filter((r) => r.result === 'fail').length;

  let critical = 0;
  let warnings = 0;
  if (run.manifest) {
    const specBy = new Map(run.manifest.checks.map((c) => [c.id, c]));
    for (const r of results) {
      if (r.result !== 'fail') continue;
      const sev = specBy.get(r.checkId)?.severityIfFail;
      if (sev === 'critical') critical += 1;
      else if (sev === 'warn') warnings += 1;
    }
  }

  return { total, passed, failed, critical, warnings };
}

// ── Hero tone ─────────────────────────────────────────────────────────────

type HeroTone = 'good' | 'warn' | 'bad';

/**
 * Pick the hero tone from the absolute pass rate, mirroring the eval recap
 * thresholds so audit + eval recaps speak the same visual language. A
 * critical finding never lets the hero stay `good` — even at 22/23, a
 * critical fail downgrades to `warn` because the user must address it.
 *
 * - `passRate >= 0.85` → `good`
 * - `passRate >= 0.5`  → `warn`
 * - else                → `bad`
 * - downgrade: any critical fail → never `good`
 */
function pickHeroTone(stats: AuditStats): HeroTone {
  if (stats.total === 0) return 'warn';
  const ratio = stats.passed / stats.total;
  let tone: HeroTone;
  if (ratio >= 0.85) tone = 'good';
  else if (ratio >= 0.5) tone = 'warn';
  else tone = 'bad';
  if (stats.critical > 0 && tone === 'good') tone = 'warn';
  return tone;
}

const HERO_TONE_CLASS: Record<HeroTone, { surface: string; badge: string }> = {
  good: {
    surface: 'border-n-healthy/30 bg-n-healthy-soft/40',
    badge: 'bg-n-healthy/20 text-n-healthy',
  },
  warn: {
    surface: 'border-n-watch/30 bg-n-watch-soft/40',
    badge: 'bg-n-watch/20 text-n-watch',
  },
  bad: {
    surface: 'border-n-critical/30 bg-n-critical-soft/40',
    badge: 'bg-n-critical/20 text-n-critical',
  },
};

/** Map hero tone → KPI card tone for the "Checks" card so it matches the hero. */
function kpiToneFromHero(tone: HeroTone): 'critical' | 'watch' | 'healthy' {
  return tone === 'good' ? 'healthy' : tone === 'warn' ? 'watch' : 'critical';
}

interface FindingRowData {
  checkId: string;
  findingCode: string;
  label: string;
  detail: string;
  severity: AuditCheckSeverity;
}

function computeFindings(run: AuditRun): FindingRowData[] {
  if (!run.manifest || !run.checkResults) return [];
  const specBy = new Map(run.manifest.checks.map((c) => [c.id, c]));
  const findings: FindingRowData[] = [];
  // Stable sort: critical first, then warn, then info.
  const sevWeight: Record<AuditCheckSeverity, number> = { critical: 0, warn: 1, info: 2 };
  for (const r of run.checkResults) {
    if (r.result !== 'fail') continue;
    const spec = specBy.get(r.checkId);
    if (!spec) continue;
    findings.push({
      checkId: r.checkId,
      findingCode: spec.findingCode,
      label: spec.label,
      detail: r.detail,
      severity: spec.severityIfFail,
    });
  }
  findings.sort((a, b) => sevWeight[a.severity] - sevWeight[b.severity]);
  return findings;
}

function summaryLine(
  stats: AuditStats,
  t: ReturnType<typeof useTranslation<'runs'>>['t'],
  hideEval: boolean,
): string {
  // `hideEval` is true for any target that is not a skill (CLAUDE.md, rule,
  // subagent, hooks, permissions, ...). Generic copy avoids gender/number
  // agreement headaches across the half-dozen target nouns.
  if (stats.critical > 0) {
    return hideEval
      ? t('audit.completed.summaryCriticalGeneric', {
          findings: stats.failed,
          critical: stats.critical,
          defaultValue:
            '{{findings}} findings, dont {{critical}} critique. Corrections requises avant déploiement.',
        })
      : t('audit.completed.summaryCritical', {
          findings: stats.failed,
          critical: stats.critical,
          defaultValue:
            '{{findings}} findings, dont {{critical}} critique. Le skill nécessite des corrections avant déploiement.',
        });
  }
  if (stats.failed > 0) {
    return hideEval
      ? t('audit.completed.summaryWarnGeneric', {
          findings: stats.failed,
          defaultValue: '{{findings}} findings. Améliorations possibles.',
        })
      : t('audit.completed.summaryWarn', {
          findings: stats.failed,
          defaultValue: '{{findings}} findings. Le skill est utilisable mais peut être amélioré.',
        });
  }
  return hideEval
    ? t('audit.completed.summaryHealthyGeneric', {
        defaultValue: 'Tous les checks sont passés. Bonnes pratiques respectées.',
      })
    : t('audit.completed.summaryHealthy', {
        defaultValue: 'Tous les checks sont passés. Le skill respecte les bonnes pratiques.',
      });
}

// ── Skill resolution ──────────────────────────────────────────────────────

/**
 * Fetch the skill record matching this audit run, picking the right IPC
 * channel from `run.scope`. Returns `null` on any error or scope mismatch
 * — the caller treats null as "skill not found, eval disabled".
 */
async function fetchSkillForRun(run: AuditRun): Promise<Skill | null> {
  try {
    if (run.scope === 'project') {
      if (!run.projectId) return null;
      return (await window.nakiros.getProjectSkill(run.projectId, run.skillName)) as Skill | null;
    }
    if (run.scope === 'claude-global') {
      return (await window.nakiros.getClaudeGlobalSkill(run.skillName)) as Skill | null;
    }
    if (run.scope === 'nakiros-bundled') {
      return (await window.nakiros.getBundledSkill(run.skillName)) as Skill | null;
    }
    if (run.scope === 'plugin') {
      if (!run.pluginName || !run.marketplaceName) return null;
      return (await window.nakiros.getPluginSkill(
        run.marketplaceName,
        run.pluginName,
        run.skillName,
      )) as Skill | null;
    }
    return null;
  } catch (err) {
    console.warn('[audit-completed] failed to load skill record', err);
    return null;
  }
}

function identityFromRun(run: AuditRun): SkillTabIdentity | null {
  if (run.scope === 'project') {
    if (!run.projectId) return null;
    return { scope: 'project', skillName: run.skillName, projectId: run.projectId };
  }
  if (run.scope === 'plugin') {
    if (!run.pluginName || !run.marketplaceName) return null;
    return {
      scope: 'plugin',
      skillName: run.skillName,
      pluginName: run.pluginName,
      marketplaceName: run.marketplaceName,
    };
  }
  return { scope: run.scope, skillName: run.skillName } as SkillTabIdentity;
}

// ── Formatters ────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
