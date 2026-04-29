import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  XCircle,
  GitCompare,
  Wrench,
  Play,
  Loader2,
} from 'lucide-react';
import type {
  AgentRun,
  BaselineEntry,
  EvalMatrix,
  EvalMatrixCell,
  IterationRunArtifact,
  ListBaselinesResponse,
  SkillEvalRun,
  SkillScope,
} from '@nakiros/shared';
import { CURRENT_MODEL_FULL_IDS, CLAUDE_MODEL_LABELS, isClaudeModelId } from '@nakiros/shared';
import { launchEvalBatch, launchFix, type OpenRunTabCallback } from '../../lib/run-launcher';
import type { SkillTabIdentity } from '../../hooks/useTabs';
import { useActiveFixForSkill } from '../../hooks/useAgentRun';
import { formatTokens } from '../../utils/format';

interface EvalRunRecapProps {
  agentRun: AgentRun;
  runs: SkillEvalRun[];
  /** Opens the diff overlay rooted at this run's iteration. */
  onOpenDiff(iteration: number): void;
  /**
   * Lets the recap launch a fresh eval batch (Re-run avec model X) or a fix
   * (Fix la régression). Comes from the shell's tab manager.
   */
  onOpenRunTab?: OpenRunTabCallback;
}

interface PerEvalRow {
  evalName: string;
  /** Current with_skill stats (or without_skill for baseline-only batches). */
  passed: number;
  total: number;
  passRate: number;
  tokens: number;
  /** Pass-rate delta vs the cached baseline. `null` when we have no baseline. */
  vsBaselineDelta: number | null;
  /** Pass-rate delta vs the previous iteration (regression detection). */
  vsPrevDelta: number | null;
  /** True when `vsPrevDelta < 0`. */
  isRegression: boolean;
}

type RecapVariant = 'skill-iteration' | 'baseline-only';

/**
 * Post-completion recap shown in the eval RunScreen once the batch is done.
 * Replaces the chat+side-panel with an actionable summary: aggregate KPIs,
 * per-eval breakdown with expandable assertions, and the "what next" actions
 * (View diff, Fix regression, Re-run on an untested model).
 *
 * Two variants:
 * - `skill-iteration`: a normal eval batch (with_skill runs). Shows
 *   "+X% pass rate vs baseline", regressions vs previous iteration, full
 *   action list.
 * - `baseline-only`: the user just refreshed the baseline. Shows the raw
 *   pass rate (this run IS the baseline — no "vs baseline" comparison),
 *   no regressions, only the Re-run-on-other-model action.
 */
export default function EvalRunRecap({
  agentRun,
  runs,
  onOpenDiff,
  onOpenRunTab,
}: EvalRunRecapProps) {
  const { t } = useTranslation('runs');

  const variant: RecapVariant = runs.every((r) => r.config === 'without_skill')
    ? 'baseline-only'
    : 'skill-iteration';

  // The runs we surface in the per-eval breakdown. For a skill iteration
  // we focus on with_skill runs; for a baseline-only batch we use the
  // without_skill runs (they're the only ones that ran).
  const focusConfig: 'with_skill' | 'without_skill' =
    variant === 'baseline-only' ? 'without_skill' : 'with_skill';
  const focusRuns = useMemo(
    () => runs.filter((r) => r.config === focusConfig),
    [runs, focusConfig],
  );

  const identity = useMemo<SkillTabIdentity | null>(
    () => deriveIdentity(agentRun, runs),
    [agentRun, runs],
  );

  // Matrix lookup — needed for prev-iteration deltas + the "models tested"
  // set. Skipped for baseline-only batches (no entry in the matrix).
  const [matrix, setMatrix] = useState<EvalMatrix | null>(null);
  // Fix-launched batches: the current iteration lives in
  // `<skillDir>/evals/.fix-temp/<fixRunId>/iteration-N` (per-fix-session
  // counter), not in the main prod workspace. Without this side-fetch
  // the per-eval lookup `prodMatrix.iterations.indexOf(currentIteration)`
  // matches a stale prod iteration with the same number (e.g. prod iter 1
  // from a previous run) and surfaces wrong pass/fail counts.
  const [fixTempMatrix, setFixTempMatrix] = useState<EvalMatrix | null>(null);
  // Baseline cache list — used to compute "vs baseline" deltas per eval.
  const [baselines, setBaselines] = useState<BaselineEntry[] | null>(null);
  // Lazy: assertions per eval, fetched on row expand.
  const [assertionsByEval, setAssertionsByEval] = useState<Record<string, AssertionItem[]>>({});
  const [loadingAssertions, setLoadingAssertions] = useState<Record<string, boolean>>({});
  const [expandedEvals, setExpandedEvals] = useState<Set<string>>(new Set());
  const [launchingModel, setLaunchingModel] = useState<string | null>(null);

  // Detect whether this batch came from a fix run (every SkillEvalRun in
  // the batch carries the parent `fixRunId`). When set we also fetch the
  // fix-temp matrix and use it for the per-eval cell lookup.
  const fixRunId = focusRuns[0]?.fixRunId ?? null;

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    void Promise.all([
      window.nakiros.getEvalMatrix(matrixRequestFromIdentity(identity)),
      window.nakiros.listEvalBaselines({
        scope: identity.scope,
        skillName: identity.skillName,
        ...(identity.scope === 'project' ? { projectId: identity.projectId } : {}),
        ...(identity.scope === 'plugin'
          ? { pluginName: identity.pluginName, marketplaceName: identity.marketplaceName }
          : {}),
      }),
      fixRunId
        ? window.nakiros.getFixTempMatrix(fixRunId).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([m, b, ft]) => {
        if (cancelled) return;
        setMatrix(m as EvalMatrix);
        setBaselines((b as ListBaselinesResponse).baselines);
        setFixTempMatrix(ft as EvalMatrix | null);
      })
      .catch(() => {
        // Best-effort — recap still shows what we know from `runs`.
      });
    return () => {
      cancelled = true;
    };
  }, [identity, fixRunId]);

  const perEvalRows = useMemo<PerEvalRow[]>(
    () =>
      buildPerEvalRows(focusRuns, matrix, baselines, agentRun, focusConfig, fixTempMatrix),
    [focusRuns, matrix, baselines, agentRun, focusConfig, fixTempMatrix],
  );

  const passed = perEvalRows.reduce((s, r) => s + r.passed, 0);
  const total = perEvalRows.reduce((s, r) => s + r.total, 0);
  const overallPassRate = total > 0 ? passed / total : 0;
  const vsBaselineMean = computeVsBaselineMean(perEvalRows);
  const regressionsList = perEvalRows.filter((r) => r.isRegression).map((r) => r.evalName);
  const totalTokens = perEvalRows.reduce((s, r) => s + r.tokens, 0);

  const handleToggleEval = async (evalName: string) => {
    setExpandedEvals((prev) => {
      const next = new Set(prev);
      if (next.has(evalName)) {
        next.delete(evalName);
      } else {
        next.add(evalName);
      }
      return next;
    });
    if (assertionsByEval[evalName] || loadingAssertions[evalName]) return;
    if (!identity) return;
    const focusRun = focusRuns.find((r) => r.evalName === evalName);
    if (!focusRun) return;
    setLoadingAssertions((prev) => ({ ...prev, [evalName]: true }));
    try {
      const artifact = (await window.nakiros.loadIterationRun({
        scope: identity.scope,
        skillName: identity.skillName,
        ...(identity.scope === 'project' ? { projectId: identity.projectId } : {}),
        ...(identity.scope === 'plugin'
          ? { pluginName: identity.pluginName, marketplaceName: identity.marketplaceName }
          : {}),
        iteration: focusRun.iteration,
        evalName,
        config: focusConfig,
        // Fix-launched evals live under `.fix-temp/<fixRunId>/iteration-N/`;
        // without this the handler reads a stale prod iter with the same
        // number (e.g. an old prod iter 1 that has nothing to do with the
        // current fix). Same reason `buildPerEvalRows` uses `fixTempMatrix`.
        ...(focusRun.fixRunId ? { fixRunId: focusRun.fixRunId } : {}),
      })) as IterationRunArtifact;
      const items = (artifact.grading?.assertion_results ?? []).map((a) => ({
        text: a.text,
        passed: a.passed,
        type: a.type,
      }));
      setAssertionsByEval((prev) => ({ ...prev, [evalName]: items }));
    } finally {
      setLoadingAssertions((prev) => ({ ...prev, [evalName]: false }));
    }
  };

  const untestedModels = useMemo(() => {
    if (variant === 'baseline-only') return [];
    const tested = new Set<string>();
    for (const m of matrix?.models ?? []) {
      if (m) tested.add(m);
    }
    return (Object.entries(CURRENT_MODEL_FULL_IDS) as Array<[
      keyof typeof CURRENT_MODEL_FULL_IDS,
      string,
    ]>)
      .filter(([, fullId]) => !tested.has(fullId))
      .map(([alias, fullId]) => ({ alias, fullId }));
  }, [matrix, variant]);

  const handleRerunOnModel = async (alias: string, fullId: string) => {
    if (!identity || !onOpenRunTab) return;
    setLaunchingModel(fullId);
    try {
      await launchEvalBatch(identity, { model: fullId }, onOpenRunTab);
    } finally {
      setLaunchingModel(null);
    }
  };

  const activeFix = useActiveFixForSkill(identity);

  const handleFixRegression = async () => {
    if (!identity || !onOpenRunTab || activeFix) return;
    await launchFix(identity, onOpenRunTab);
  };

  const headerTitle =
    variant === 'baseline-only'
      ? t('recap.titleBaseline', {
          defaultValue: 'Baseline · {{skill}}',
          skill: identity?.skillName ?? '',
        })
      : t('recap.titleSkill', {
          defaultValue: '{{skill}} · iteration recap',
          skill: identity?.skillName ?? '',
        });

  const heroPct = Math.round(overallPassRate * 100);
  const heroLabel =
    variant === 'baseline-only'
      ? t('recap.heroBaseline', {
          defaultValue: '{{pct}}% pass rate (baseline)',
          pct: heroPct,
        })
      : vsBaselineMean !== null
        ? t('recap.heroVsBaseline', {
            defaultValue: '{{sign}}{{pct}}% pass rate vs baseline',
            sign: vsBaselineMean >= 0 ? '+' : '',
            pct: Math.round(vsBaselineMean * 100),
          })
        : t('recap.heroNoBaseline', {
            defaultValue: '{{pct}}% pass rate',
            pct: heroPct,
          });

  // Tone is driven by the absolute pass rate so red / orange / green is
  // readable at a glance regardless of variant. Skill iterations get
  // bumped DOWN to orange when there's any regression vs prev iter, even
  // if pass rate is high — the recap is also a "any problem to fix?"
  // signal, not just an absolute score.
  const heroTone = pickHeroTone(overallPassRate, regressionsList.length, variant);

  return (
    <div className="flex-1 overflow-y-auto bg-n-canvas px-7 py-6 font-n-sans">
      <div className="mx-auto flex max-w-[920px] flex-col gap-5">
        {/* Hero */}
        <div
          className={
            'flex items-start gap-3.5 rounded-n-lg border px-4 py-3.5 ' +
            HERO_TONE_CLASS[heroTone].surface
          }
        >
          <div
            className={
              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-n-md ' +
              HERO_TONE_CLASS[heroTone].badge
            }
          >
            {heroTone === 'good' ? (
              <Check size={18} strokeWidth={2.5} />
            ) : heroTone === 'warn' ? (
              <AlertTriangle size={18} strokeWidth={2.5} />
            ) : (
              <XCircle size={18} strokeWidth={2.5} />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
              {headerTitle}
            </span>
            <span className="text-[20px] font-semibold text-n-fg">{heroLabel}</span>
            {variant === 'skill-iteration' && (
              <span className="text-[12.5px] text-n-muted">
                {regressionsList.length === 0
                  ? t('recap.heroSubtitleClean', {
                      defaultValue: '{{count}} eval(s) — aucune régression vs run précédent.',
                      count: perEvalRows.length,
                    })
                  : t('recap.heroSubtitleRegressed', {
                      defaultValue:
                        '{{count}} eval(s). Régression sur {{names}}.',
                      count: perEvalRows.length,
                      names: regressionsList.join(', '),
                    })}
              </span>
            )}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label={t('recap.kpi.passRate', { defaultValue: 'pass rate' })}
            value={`${heroPct}%`}
            tone={heroPct >= 85 ? 'good' : heroPct >= 50 ? 'warn' : 'bad'}
          />
          {variant === 'skill-iteration' && (
            <KpiCard
              label={t('recap.kpi.vsBaseline', { defaultValue: 'vs baseline' })}
              value={
                vsBaselineMean === null
                  ? '—'
                  : `${vsBaselineMean >= 0 ? '+' : ''}${Math.round(vsBaselineMean * 100)}%`
              }
              tone={
                vsBaselineMean === null
                  ? 'neutral'
                  : vsBaselineMean >= 0
                    ? 'good'
                    : 'bad'
              }
            />
          )}
          {variant === 'skill-iteration' && (
            <KpiCard
              label={t('recap.kpi.regressions', { defaultValue: 'regressions' })}
              value={regressionsList.length.toString()}
              tone={regressionsList.length > 0 ? 'warn' : 'neutral'}
            />
          )}
          <KpiCard
            label={t('recap.kpi.tokens', { defaultValue: 'tokens' })}
            value={formatTokens(totalTokens)}
            tone="neutral"
          />
        </div>

        {/* Per-eval breakdown */}
        <div className="flex flex-col gap-2">
          <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
            {t('recap.perEval', { defaultValue: 'per-eval breakdown' })}
          </span>
          <div className="flex flex-col gap-1.5 rounded-n-lg border border-n-border-subtle bg-n-surface">
            {perEvalRows.map((row) => (
              <PerEvalRowView
                key={row.evalName}
                row={row}
                expanded={expandedEvals.has(row.evalName)}
                assertions={assertionsByEval[row.evalName]}
                loading={!!loadingAssertions[row.evalName]}
                onToggle={() => handleToggleEval(row.evalName)}
                showVsBaseline={variant === 'skill-iteration'}
              />
            ))}
            {perEvalRows.length === 0 && (
              <div className="px-4 py-3 font-n-mono text-[11.5px] text-n-faint">
                {t('recap.noRows', { defaultValue: 'No eval data to show.' })}
              </div>
            )}
          </div>
        </div>

        {/* Next steps */}
        <div className="flex flex-col gap-2">
          <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
            {t('recap.nextSteps', { defaultValue: 'prochaines étapes' })}
          </span>
          <div className="flex flex-col gap-2">
            {variant === 'skill-iteration' && regressionsList.length > 0 && (
              <NextStepCard
                icon={<Wrench size={14} strokeWidth={2.25} />}
                title={
                  activeFix
                    ? t('recap.actions.fixRegression.titleRunning', {
                        defaultValue: 'Fix déjà en cours sur ce skill',
                      })
                    : t('recap.actions.fixRegression.title', {
                        defaultValue: 'Fix la régression sur {{names}}',
                        names: regressionsList.join(', '),
                      })
                }
                subtitle={t('recap.actions.fixRegression.subtitle', {
                  defaultValue:
                    '{{count}} eval(s) en régression — lance un fix run pour les corriger.',
                  count: regressionsList.length,
                })}
                onClick={handleFixRegression}
                disabled={!identity || !onOpenRunTab || !!activeFix}
              />
            )}
            {variant === 'skill-iteration' && (
              <NextStepCard
                icon={<GitCompare size={14} strokeWidth={2.25} />}
                title={t('recap.actions.viewDiff.title', {
                  defaultValue: 'Voir le diff vs run précédent',
                })}
                subtitle={t('recap.actions.viewDiff.subtitle', {
                  defaultValue: 'Comparaison assertion-par-assertion.',
                })}
                onClick={() => {
                  const iter = focusRuns[0]?.iteration;
                  if (iter !== undefined) onOpenDiff(iter);
                }}
              />
            )}
            {untestedModels.map(({ alias, fullId }) => {
              const isLaunching = launchingModel === fullId;
              const aliasLabel =
                isClaudeModelId(alias) && CLAUDE_MODEL_LABELS[alias]
                  ? CLAUDE_MODEL_LABELS[alias]
                  : alias;
              return (
                <NextStepCard
                  key={fullId}
                  icon={
                    isLaunching ? (
                      <Loader2 size={14} strokeWidth={2.25} className="animate-spin" />
                    ) : (
                      <Play size={14} strokeWidth={2.25} />
                    )
                  }
                  title={t('recap.actions.rerunOnModel.title', {
                    defaultValue: 'Re-run avec {{model}}',
                    model: aliasLabel,
                  })}
                  subtitle={t('recap.actions.rerunOnModel.subtitle', {
                    defaultValue: '{{fullId}} — modèle pas encore testé sur ce skill.',
                    fullId,
                  })}
                  onClick={() => handleRerunOnModel(alias, fullId)}
                  disabled={!identity || !onOpenRunTab || isLaunching}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hero tone ─────────────────────────────────────────────────────────────

type HeroTone = 'good' | 'warn' | 'bad';

/**
 * Pick the hero tone from the absolute pass rate, with a downgrade rule:
 * a skill iteration that has any regression vs the previous run never
 * stays "good" — the recap is meant to surface things to investigate,
 * and a clean 90% pass rate that just dropped from 100% should still
 * read as "warn".
 */
function pickHeroTone(
  passRate: number,
  regressionsCount: number,
  variant: RecapVariant,
): HeroTone {
  let tone: HeroTone;
  // Bands: >= 75% green, > 0% orange, 0% red. A run where every test
  // fails is the only case that justifies the harsh red — anything that
  // passes some tests is still salvageable and stays orange.
  if (passRate >= 0.75) tone = 'good';
  else if (passRate > 0) tone = 'warn';
  else tone = 'bad';
  if (variant === 'skill-iteration' && regressionsCount > 0 && tone === 'good') {
    tone = 'warn';
  }
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

// ── Helpers ───────────────────────────────────────────────────────────────

function deriveIdentity(agentRun: AgentRun, runs: SkillEvalRun[]): SkillTabIdentity | null {
  const target = agentRun.target;
  if (!target || target.type !== 'skill') {
    // Fallback to the head run if target is missing somehow.
    const head = runs[0];
    if (!head) return null;
    return identityFromRun(head);
  }
  const head = runs[0];
  const scope = (head?.scope ?? target.scope) as SkillScope;
  if (scope === 'project') {
    return {
      scope: 'project',
      skillName: target.skillName,
      projectId: head?.projectId ?? target.projectId ?? '',
    };
  }
  if (scope === 'plugin') {
    return {
      scope: 'plugin',
      skillName: target.skillName,
      pluginName: head?.pluginName ?? target.pluginName ?? '',
      marketplaceName: head?.marketplaceName ?? target.marketplaceName ?? '',
    };
  }
  return { scope, skillName: target.skillName } as SkillTabIdentity;
}

function identityFromRun(run: SkillEvalRun): SkillTabIdentity {
  if (run.scope === 'project') {
    return { scope: 'project', skillName: run.skillName, projectId: run.projectId ?? '' };
  }
  if (run.scope === 'plugin') {
    return {
      scope: 'plugin',
      skillName: run.skillName,
      pluginName: run.pluginName ?? '',
      marketplaceName: run.marketplaceName ?? '',
    };
  }
  return { scope: run.scope, skillName: run.skillName } as SkillTabIdentity;
}

function matrixRequestFromIdentity(identity: SkillTabIdentity) {
  if (identity.scope === 'project') {
    return {
      scope: identity.scope,
      skillName: identity.skillName,
      projectId: identity.projectId,
    };
  }
  if (identity.scope === 'plugin') {
    return {
      scope: identity.scope,
      skillName: identity.skillName,
      pluginName: identity.pluginName,
      marketplaceName: identity.marketplaceName,
    };
  }
  return { scope: identity.scope, skillName: identity.skillName };
}

function buildPerEvalRows(
  focusRuns: SkillEvalRun[],
  matrix: EvalMatrix | null,
  baselines: BaselineEntry[] | null,
  agentRun: AgentRun,
  focusConfig: 'with_skill' | 'without_skill',
  fixTempMatrix: EvalMatrix | null,
): PerEvalRow[] {
  // Group runs by evalName.
  const perEval = new Map<string, SkillEvalRun[]>();
  for (const r of focusRuns) {
    const list = perEval.get(r.evalName) ?? [];
    list.push(r);
    perEval.set(r.evalName, list);
  }

  // Pre-index baselines by evalName for O(1) lookup.
  const baselineByEval = new Map<string, BaselineEntry>();
  for (const b of baselines ?? []) {
    baselineByEval.set(b.evalName, b);
  }

  // For fix-launched batches the iteration counter restarts at 1 inside
  // `.fix-temp/<fixRunId>/`, so the cells must be looked up in the
  // fix-temp matrix. The prod matrix is still used for the "vs prev"
  // comparison — but with the right semantics: prev = last `kind: skill`
  // iter from prod (i.e. "the skill as it ran in production before this
  // fix session"), not iter idx−1 of the merged sequence.
  const isFixLaunched = fixTempMatrix !== null && fixTempMatrix.iterations.length > 0;
  const cellMatrix = isFixLaunched ? (fixTempMatrix as EvalMatrix) : matrix;

  const currentIteration =
    agentRun.meta?.kind === 'eval' ? agentRun.meta.iteration : undefined;
  const prevByEval = new Map<string, EvalMatrixCell>();
  if (isFixLaunched && matrix) {
    // Walk prod from the highest iteration down; pick the first `kind:
    // skill` row and use its with_skill cells as prev. Mirrors
    // `computeFixEvalPrevious` in the daemon's fix-eval batch finaliser.
    const prodIters = matrix.iterations
      .map((iter, idx) => ({ iter, idx, kind: matrix.kinds[idx] }))
      .filter((e) => e.kind === 'skill')
      .sort((a, b) => b.iter - a.iter);
    const lastSkill = prodIters[0];
    if (lastSkill) {
      for (const row of matrix.rows) {
        const cell = row.withSkill[lastSkill.idx];
        if (cell) prevByEval.set(row.evalName, cell);
      }
    }
  } else if (matrix && currentIteration !== undefined) {
    // Non-fix path: prev = iter immediately before the current one in prod.
    const idx = matrix.iterations.indexOf(currentIteration);
    const prevIdx = idx > 0 ? idx - 1 : -1;
    if (prevIdx >= 0) {
      for (const row of matrix.rows) {
        const cell = row.withSkill[prevIdx];
        if (cell) prevByEval.set(row.evalName, cell);
      }
    }
  }

  const rows: PerEvalRow[] = [];
  for (const [evalName, runs] of perEval) {
    // Aggregate stats across all runs that share this evalName + focusConfig.
    // In practice that's a single run (one eval × one config), but the
    // aggregation is defensive.
    let passed = 0;
    let total = 0;
    let tokens = 0;
    for (const r of runs) {
      tokens += r.tokensUsed ?? 0;
      // We don't have grading in SkillEvalRun directly — derive from
      // outputFiles existing? Better: rely on the agentRun aggregate which
      // already exposes passed/total via the eval grading. As a fallback we
      // count assertion text once it's lazy-loaded via loadIterationRun.
      // For the recap row, pull from the matrix when available (it has the
      // per-eval config stats for the current iteration).
    }
    if (cellMatrix && currentIteration !== undefined) {
      const idx = cellMatrix.iterations.indexOf(currentIteration);
      if (idx >= 0) {
        const matRow = cellMatrix.rows.find((r) => r.evalName === evalName);
        const cell =
          focusConfig === 'with_skill'
            ? matRow?.withSkill[idx]
            : matRow?.withoutSkill[idx];
        if (cell) {
          passed = cell.passed;
          total = cell.total;
          tokens = cell.tokens;
        }
      }
    }
    const passRate = total > 0 ? passed / total : 0;
    const baseline = baselineByEval.get(evalName);
    const vsBaselineDelta =
      focusConfig === 'with_skill' && baseline
        ? passRate - baseline.stats.passRate
        : null;
    const prev = prevByEval.get(evalName);
    const vsPrevDelta = prev ? passRate - prev.passRate : null;
    rows.push({
      evalName,
      passed,
      total,
      passRate,
      tokens,
      vsBaselineDelta,
      vsPrevDelta,
      isRegression: vsPrevDelta !== null && vsPrevDelta < 0,
    });
  }
  // Sort: regressions first, then alphabetical.
  rows.sort((a, b) => {
    if (a.isRegression !== b.isRegression) return a.isRegression ? -1 : 1;
    return a.evalName.localeCompare(b.evalName);
  });
  return rows;
}

function computeVsBaselineMean(rows: PerEvalRow[]): number | null {
  const deltas = rows
    .map((r) => r.vsBaselineDelta)
    .filter((d): d is number => d !== null);
  if (deltas.length === 0) return null;
  return deltas.reduce((s, d) => s + d, 0) / deltas.length;
}

// ── Sub-components ───────────────────────────────────────────────────────

interface AssertionItem {
  text: string;
  passed: boolean;
  type: 'script' | 'llm' | 'manual';
}

function PerEvalRowView({
  row,
  expanded,
  assertions,
  loading,
  onToggle,
  showVsBaseline,
}: {
  row: PerEvalRow;
  expanded: boolean;
  assertions: AssertionItem[] | undefined;
  loading: boolean;
  onToggle(): void;
  showVsBaseline: boolean;
}) {
  const dotTone =
    row.passRate >= 0.75
      ? 'bg-n-healthy'
      : row.passRate > 0
        ? 'bg-n-watch'
        : 'bg-n-critical';
  return (
    <div className="border-b border-n-border-subtle/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-n-raised/40"
      >
        <span className="text-n-faint">
          {expanded ? (
            <ChevronDown size={13} strokeWidth={2.25} />
          ) : (
            <ChevronRight size={13} strokeWidth={2.25} />
          )}
        </span>
        <span className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + dotTone} />
        <span className="flex-1 truncate font-n-mono text-[12.5px] text-n-fg">{row.evalName}</span>
        <span className="font-n-mono text-[11.5px] text-n-muted">
          {row.passed}/{row.total}
        </span>
        {showVsBaseline && (
          <span
            className={
              'w-12 text-right font-n-mono text-[11.5px] ' +
              (row.vsBaselineDelta === null
                ? 'text-n-faint'
                : row.vsBaselineDelta >= 0
                  ? 'text-n-healthy'
                  : 'text-n-critical')
            }
          >
            {row.vsBaselineDelta === null
              ? '—'
              : `${row.vsBaselineDelta >= 0 ? '+' : ''}${Math.round(row.vsBaselineDelta * 100)}%`}
          </span>
        )}
        <span className="w-14 text-right font-n-mono text-[10.5px] text-n-faint">
          {formatTokens(row.tokens)}
        </span>
      </button>
      {expanded && (
        <div className="bg-n-sunken/40 px-10 py-2.5">
          {loading ? (
            <div className="flex items-center gap-2 font-n-mono text-[11px] text-n-faint">
              <Loader2 size={12} className="animate-spin" />
              loading assertions…
            </div>
          ) : assertions && assertions.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {assertions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px]">
                  <span
                    className={
                      'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-n-xs ' +
                      (a.passed
                        ? 'bg-n-healthy/20 text-n-healthy'
                        : 'bg-n-critical/20 text-n-critical')
                    }
                  >
                    {a.passed ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-n-muted">{a.text}</span>
                  <span className="ml-auto font-n-mono text-[10px] uppercase tracking-[0.6px] text-n-faint">
                    {a.type}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="font-n-mono text-[11px] text-n-faint">no assertions recorded.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const valueClass =
    tone === 'good'
      ? 'text-n-healthy'
      : tone === 'warn'
        ? 'text-n-watch'
        : tone === 'bad'
          ? 'text-n-critical'
          : 'text-n-fg';
  return (
    <div className="flex flex-col gap-1 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-3">
      <span className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">
        {label}
      </span>
      <span className={'text-[22px] font-semibold ' + valueClass}>{value}</span>
    </div>
  );
}

function NextStepCard({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'flex w-full items-center gap-3 rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-3 text-left transition-colors ' +
        (disabled ? 'opacity-60' : 'hover:bg-n-raised/40')
      }
    >
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-n-sm bg-n-accent-soft text-n-accent">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12.5px] font-medium text-n-fg">{title}</span>
        <span className="truncate text-[11.5px] text-n-muted">{subtitle}</span>
      </div>
      <ChevronRight size={14} strokeWidth={2} className="flex-shrink-0 text-n-faint" />
    </button>
  );
}
