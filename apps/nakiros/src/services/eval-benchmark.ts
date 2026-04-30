import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { FixBenchmarkSnapshot, SkillEvalRunSummary } from '@nakiros/shared';
import { computeSkillFingerprint } from './skill-fingerprint.js';

interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
}

interface GradingFile {
  summary: GradingSummary;
}

interface TimingFile {
  total_tokens: number;
  duration_ms: number;
  model?: string;
}

/** Flat per-eval + per-config stats used inside `benchmark.json` (snake_case matches the on-disk shape). */
export interface EvalConfigStats {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
  tokens: number;
  duration_ms: number;
}

interface EvalStats {
  with_skill?: EvalConfigStats;
  without_skill?: EvalConfigStats;
  delta?: { pass_rate: number; tokens: number; duration_ms: number };
}

interface RunSummaryAgg {
  pass_rate: { mean: number };
  total_assertions: number;
  passed_assertions: number;
  failed_assertions: number;
  tokens: { mean: number };
  duration_ms: { mean: number };
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Read `grading.json` + `timing.json` for a single eval/config cell and flatten
 * into the stats shape. Shared with the comparison runner.
 */
export function collectConfigStats(evalDir: string, config: 'with_skill' | 'without_skill'): EvalConfigStats | undefined {
  const configDir = join(evalDir, config);
  if (!existsSync(configDir)) return undefined;
  const grading = readJson<GradingFile>(join(configDir, 'grading.json'));
  const timing = readJson<TimingFile>(join(configDir, 'timing.json'));
  if (!grading) return undefined;
  return {
    passed: grading.summary.passed,
    failed: grading.summary.failed,
    total: grading.summary.total,
    pass_rate: grading.summary.pass_rate,
    tokens: timing?.total_tokens ?? 0,
    duration_ms: timing?.duration_ms ?? 0,
  };
}

function aggregateRunSummary(evals: Record<string, EvalStats>, key: 'with_skill' | 'without_skill'): RunSummaryAgg {
  const configs = Object.values(evals)
    .map((e) => e[key])
    .filter((c): c is EvalConfigStats => Boolean(c));

  if (configs.length === 0) {
    return {
      pass_rate: { mean: 0 },
      total_assertions: 0,
      passed_assertions: 0,
      failed_assertions: 0,
      tokens: { mean: 0 },
      duration_ms: { mean: 0 },
    };
  }

  const total = configs.reduce((s, c) => s + c.total, 0);
  const passed = configs.reduce((s, c) => s + c.passed, 0);
  const failed = configs.reduce((s, c) => s + c.failed, 0);
  const tokens = configs.reduce((s, c) => s + c.tokens, 0);
  const duration = configs.reduce((s, c) => s + c.duration_ms, 0);

  return {
    pass_rate: { mean: total > 0 ? passed / total : 0 },
    total_assertions: total,
    passed_assertions: passed,
    failed_assertions: failed,
    tokens: { mean: Math.round(tokens / configs.length) },
    duration_ms: { mean: Math.round(duration / configs.length) },
  };
}

/**
 * Optional inputs for {@link writeIterationBenchmark}. Used by the eval runner
 * to inject baseline stats sourced from the cache (`~/.nakiros/baselines/...`)
 * when a given eval was a cache hit and therefore did not produce on-disk
 * `without_skill/` artefacts for this iteration.
 */
export interface WriteBenchmarkOptions {
  /**
   * Per-eval baseline stats to use as fallback when the iteration workspace
   * has no `without_skill/` directory for that eval. Cache misses in the same
   * iteration still write their fresh baseline to disk and are picked up via
   * the on-disk scan — they don't appear in this map.
   */
  baselinesByEval?: Record<string, EvalConfigStats | undefined>;
  /**
   * What kind of run produced this iteration: `'skill'` for a normal eval
   * batch, `'baseline'` for a baseline-only refresh, or `'fix-temp'` for
   * an iteration produced by `fix:runEvalsInTemp`. Surfaced by the matrix
   * so the frontend can distinguish them visually (muted column bg,
   * sparkline marker color, diff selector tag). Defaults to `'skill'`
   * when omitted, matching pre-refactor benchmarks.
   */
  kind?: 'skill' | 'baseline' | 'fix-temp';
  /**
   * Owning fix runId when `kind === 'fix-temp'`. Lets `fix:finish` promote
   * the latest fix-temp iter of `fixRunId` to `'skill'` and `fix:stopRun`
   * delete every iter of the batch.
   */
  fixRunId?: string;
}

/**
 * Resolve the workspace directory under which `iteration-N/` folders live
 * for a given context. Skill iterations and baseline refreshes go into
 * `evals/workspace/`; fix-temp iterations are isolated under
 * `evals/.fix-temp/<fixRunId>/` so they never bump the skill's iteration
 * counter and the main eval matrix never sees them.
 */
export function resolveEvalWorkspaceDir(skillDir: string, fixRunId?: string): string {
  return fixRunId
    ? join(skillDir, 'evals', '.fix-temp', fixRunId)
    : join(skillDir, 'evals', 'workspace');
}

/**
 * Compute `benchmark.json` for a completed iteration by scanning each eval-XXX subdirectory.
 * Writes the file at `{skillDir}/evals/workspace/iteration-N/benchmark.json` for
 * regular skill/baseline iterations, or at
 * `{skillDir}/evals/.fix-temp/<fixRunId>/iteration-N/benchmark.json` when
 * `opts.fixRunId` is set (fix-temp evals — kept out of the main history).
 *
 * When `opts.baselinesByEval` is provided, evals without an on-disk
 * `without_skill/` dir fall back to the supplied stats (typically reused from
 * the per-model baseline cache populated by the eval runner).
 */
export function writeIterationBenchmark(
  skillDir: string,
  skillName: string,
  iteration: number,
  opts: WriteBenchmarkOptions = {},
): void {
  const workspaceDir = resolveEvalWorkspaceDir(skillDir, opts.fixRunId);
  const iterDir = join(workspaceDir, `iteration-${iteration}`);
  if (!existsSync(iterDir)) return;

  let evalDirs: string[];
  try {
    evalDirs = readdirSync(iterDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('eval-'))
      .map((e) => e.name);
  } catch {
    return;
  }

  const perEval: Record<string, EvalStats> = {};
  // Capture the model used for this iteration. All `with_skill` runs in a
  // single iteration share the same model by design (the Evolution view is
  // mono-model) — we read from the first run that has one in its timing.json.
  let iterationModel: string | null = null;
  for (const evalDirName of evalDirs) {
    const evalName = evalDirName.replace(/^eval-/, '');
    const evalDir = join(iterDir, evalDirName);
    const withSkill = collectConfigStats(evalDir, 'with_skill');
    const onDiskBaseline = collectConfigStats(evalDir, 'without_skill');
    const withoutSkill = onDiskBaseline ?? opts.baselinesByEval?.[evalName];

    if (!iterationModel) {
      const timing = readJson<TimingFile>(join(evalDir, 'with_skill', 'timing.json'));
      if (timing?.model) iterationModel = timing.model;
    }

    const stats: EvalStats = {};
    if (withSkill) stats.with_skill = withSkill;
    if (withoutSkill) stats.without_skill = withoutSkill;
    if (withSkill && withoutSkill) {
      stats.delta = {
        pass_rate: withSkill.pass_rate - withoutSkill.pass_rate,
        tokens: withSkill.tokens - withoutSkill.tokens,
        duration_ms: withSkill.duration_ms - withoutSkill.duration_ms,
      };
    }
    perEval[evalName] = stats;
  }

  const withAgg = aggregateRunSummary(perEval, 'with_skill');
  const withoutAgg = aggregateRunSummary(perEval, 'without_skill');
  const delta = {
    pass_rate: withAgg.pass_rate.mean - withoutAgg.pass_rate.mean,
    tokens: withAgg.tokens.mean - withoutAgg.tokens.mean,
    duration_ms: withAgg.duration_ms.mean - withoutAgg.duration_ms.mean,
  };

  // Capture the skill's content hash at the moment the benchmark is written.
  // The eval matrix uses this to tell apart a real regression (hash changed →
  // something in the skill actually moved) from judge variance (hash identical
  // → the LLM just graded the same content slightly differently).
  // Best-effort: fingerprint failure doesn't block benchmark persistence.
  let skillFingerprint: string | null = null;
  try {
    skillFingerprint = computeSkillFingerprint(skillDir);
  } catch (err) {
    console.warn(
      `[eval-benchmark] Failed to compute skill fingerprint for ${skillName}: ${(err as Error).message}`,
    );
  }

  // Preserve `kind` / `fix_run_id` from the existing `benchmark.json` when
  // the caller didn't pass them. Otherwise the per-run mid-batch refresh
  // (which has no opts) would clobber a `'fix-temp'` tag set by the final
  // batch write earlier in the same iteration.
  const existingPath = join(iterDir, 'benchmark.json');
  let existingKind: 'skill' | 'baseline' | 'fix-temp' | undefined;
  let existingFixRunId: string | undefined;
  if (existsSync(existingPath)) {
    try {
      const prev = JSON.parse(readFileSync(existingPath, 'utf8')) as {
        kind?: 'skill' | 'baseline' | 'fix-temp';
        fix_run_id?: string;
      };
      if (prev.kind === 'skill' || prev.kind === 'baseline' || prev.kind === 'fix-temp') {
        existingKind = prev.kind;
      }
      if (typeof prev.fix_run_id === 'string') existingFixRunId = prev.fix_run_id;
    } catch {
      // ignore — fall through to defaults
    }
  }
  const resolvedKind = opts.kind ?? existingKind ?? 'skill';
  const resolvedFixRunId = opts.fixRunId ?? existingFixRunId;

  const benchmark = {
    skill_name: skillName,
    iteration,
    timestamp: new Date().toISOString(),
    // `'baseline'` for baseline-only refreshes triggered from the kebab
    // menu; `'skill'` for normal eval batches; `'fix-temp'` for evals
    // launched from a fix run (against its in-progress sandbox). The
    // matrix uses this to tag iterations without re-deriving the kind
    // from cell contents.
    kind: resolvedKind,
    // Set only on `'fix-temp'` iterations — lets the fix lifecycle
    // (finish/reject) target the right batch in the workspace.
    ...(resolvedFixRunId ? { fix_run_id: resolvedFixRunId } : {}),
    skill_fingerprint: skillFingerprint,
    model: iterationModel,
    run_summary: {
      with_skill: withAgg,
      without_skill: withoutAgg,
      delta,
    },
    per_eval: perEval,
  };

  writeFileSync(existingPath, JSON.stringify(benchmark, null, 2), 'utf8');
}

/**
 * Read the highest-numbered iteration's benchmark.json from a skill dir.
 * Returns null if no iterations or no benchmark file exists.
 *
 * When `fixRunId` is set, reads from `evals/.fix-temp/<fixRunId>/` instead
 * of the main workspace — used by `fix:getBenchmarks` to surface the
 * latest fix-temp result in the fix chat without polluting the prod
 * history.
 */
export function readLatestIterationBenchmark(
  skillDir: string,
  fixRunId?: string,
): FixBenchmarkSnapshot | null {
  const workspaceDir = resolveEvalWorkspaceDir(skillDir, fixRunId);
  if (!existsSync(workspaceDir)) return null;

  let iterNums: number[];
  try {
    iterNums = readdirSync(workspaceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
      .map((e) => parseInt(e.name.replace('iteration-', ''), 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a);
  } catch {
    return null;
  }

  for (const iteration of iterNums) {
    const benchmarkPath = join(workspaceDir, `iteration-${iteration}`, 'benchmark.json');
    if (!existsSync(benchmarkPath)) continue;
    let raw: {
      timestamp?: string;
      run_summary?: {
        with_skill?: RunSummaryAgg;
        without_skill?: RunSummaryAgg;
      };
    };
    try {
      raw = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
    } catch {
      continue;
    }

    const toSummary = (agg: RunSummaryAgg | undefined): SkillEvalRunSummary | null => {
      if (!agg) return null;
      const passRate = agg.pass_rate?.mean ?? 0;
      const total = agg.total_assertions ?? 0;
      const passed = agg.passed_assertions ?? 0;
      return {
        passRate,
        totalAssertions: total,
        passedAssertions: passed,
        failedAssertions: agg.failed_assertions ?? total - passed,
        tokens: agg.tokens?.mean ?? 0,
        durationMs: agg.duration_ms?.mean ?? 0,
      };
    };

    const withSkill = toSummary(raw.run_summary?.with_skill);
    if (!withSkill) continue;
    return {
      iteration,
      timestamp: raw.timestamp ?? null,
      withSkill,
      withoutSkill: toSummary(raw.run_summary?.without_skill),
    };
  }
  return null;
}
