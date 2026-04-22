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
 * Compute `benchmark.json` for a completed iteration by scanning each eval-XXX subdirectory.
 * Writes the file at `{skillDir}/evals/workspace/iteration-N/benchmark.json`.
 */
export function writeIterationBenchmark(skillDir: string, skillName: string, iteration: number): void {
  const iterDir = join(skillDir, 'evals', 'workspace', `iteration-${iteration}`);
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
    const withoutSkill = collectConfigStats(evalDir, 'without_skill');

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

  const benchmark = {
    skill_name: skillName,
    iteration,
    timestamp: new Date().toISOString(),
    skill_fingerprint: skillFingerprint,
    model: iterationModel,
    run_summary: {
      with_skill: withAgg,
      without_skill: withoutAgg,
      delta,
    },
    per_eval: perEval,
  };

  writeFileSync(join(iterDir, 'benchmark.json'), JSON.stringify(benchmark, null, 2), 'utf8');
}

/**
 * Read the highest-numbered iteration's benchmark.json from a skill dir.
 * Returns null if no iterations or no benchmark file exists.
 */
export function readLatestIterationBenchmark(skillDir: string): FixBenchmarkSnapshot | null {
  const workspaceDir = join(skillDir, 'evals', 'workspace');
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
