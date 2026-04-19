import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

import type {
  EvalMatrix,
  EvalMatrixCell,
  EvalMatrixMetrics,
  EvalMatrixRow,
  EvalMatrixTag,
} from '@nakiros/shared';

// ─── Tuning constants (validated by user) ───────────────────────────────────

/** σ strictly below this is considered STABLE. */
const STABLE_STD_DEV_MAX = 0.10;
/** σ strictly above this is considered FLAKY / NOISY. */
const FLAKY_STD_DEV_MIN = 0.20;
/**
 * Minimum drop between two consecutive iterations that counts as BROKEN
 * regardless of the historical σ. Protects against cases where the first
 * N iterations are all 100% (σ=0) so "2σ" = 0 and tiny dips would trigger.
 */
const BROKEN_ABSOLUTE_DROP = 0.30;
/** Same, for FIXED (gain). */
const FIXED_ABSOLUTE_GAIN = 0.30;
/** Tags STABLE/FLAKY/NOISY need at least this many iterations to be meaningful. */
const MIN_ITERATIONS_FOR_STABILITY_TAGS = 3;

// ─── Raw benchmark shape (mirror what eval-benchmark.ts writes) ─────────────

interface BenchmarkConfigStats {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
  tokens: number;
  duration_ms: number;
}

interface BenchmarkPerEval {
  with_skill?: BenchmarkConfigStats;
  without_skill?: BenchmarkConfigStats;
}

interface BenchmarkFile {
  skill_name?: string;
  iteration: number;
  timestamp?: string;
  skill_fingerprint?: string | null;
  per_eval: Record<string, BenchmarkPerEval>;
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Build the eval matrix for a skill by walking every `iteration-N/benchmark.json`
 * under its workspace. Returns an empty matrix shape if the skill has no history.
 */
export function buildEvalMatrix(skillDir: string, skillName: string): EvalMatrix {
  const workspaceDir = join(skillDir, 'evals', 'workspace');
  const benchmarks = loadBenchmarks(workspaceDir);

  if (benchmarks.length === 0) {
    return {
      skillName,
      iterations: [],
      fingerprints: [],
      rows: [],
      metrics: emptyMetrics(),
    };
  }

  const iterations = benchmarks.map((b) => b.iteration);
  const fingerprints = benchmarks.map((b) => b.skill_fingerprint ?? null);

  // Collect every eval name that ever appeared so the matrix can show
  // "introduced at iter N" via null cells before that point.
  const evalNames = new Set<string>();
  for (const b of benchmarks) {
    for (const name of Object.keys(b.per_eval ?? {})) evalNames.add(name);
  }

  const rows: EvalMatrixRow[] = [];
  for (const evalName of Array.from(evalNames).sort()) {
    const withSkill: Array<EvalMatrixCell | null> = [];
    const withoutSkill: Array<EvalMatrixCell | null> = [];

    for (const b of benchmarks) {
      const stats = b.per_eval?.[evalName];
      withSkill.push(stats?.with_skill ? toCell(stats.with_skill, b.iteration, 'with_skill', workspaceDir, evalName) : null);
      withoutSkill.push(stats?.without_skill ? toCell(stats.without_skill, b.iteration, 'without_skill', workspaceDir, evalName) : null);
    }

    const tag = computeTag({
      withSkill,
      iterations,
      fingerprints,
    });

    rows.push({ evalName, withSkill, withoutSkill, tag });
  }

  const metrics = computeMetrics(iterations, rows);
  return { skillName, iterations, fingerprints, rows, metrics };
}

// ─── Benchmark loading ──────────────────────────────────────────────────────

function loadBenchmarks(workspaceDir: string): BenchmarkFile[] {
  if (!existsSync(workspaceDir)) return [];
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(workspaceDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const benchmarks: BenchmarkFile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('iteration-')) continue;
    const benchmarkPath = join(workspaceDir, entry.name, 'benchmark.json');
    if (!existsSync(benchmarkPath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(benchmarkPath, 'utf8')) as BenchmarkFile;
      if (typeof parsed.iteration !== 'number') continue;
      benchmarks.push(parsed);
    } catch {
      // skip malformed benchmark
    }
  }

  benchmarks.sort((a, b) => a.iteration - b.iteration);
  return benchmarks;
}

function toCell(
  stats: BenchmarkConfigStats,
  iteration: number,
  config: 'with_skill' | 'without_skill',
  workspaceDir: string,
  evalName: string,
): EvalMatrixCell {
  const runDirAbs = join(workspaceDir, `iteration-${iteration}`, `eval-${evalName}`, config);
  // Return path relative to the skill root so the frontend can build URLs
  // without leaking absolute filesystem paths.
  const skillRoot = relative(join(workspaceDir, '..', '..'), runDirAbs).replace(/\\/g, '/');
  return {
    iteration,
    config,
    passed: stats.passed,
    total: stats.total,
    passRate: stats.pass_rate,
    tokens: stats.tokens,
    durationMs: stats.duration_ms,
    runDir: skillRoot,
  };
}

// ─── Tag computation ────────────────────────────────────────────────────────

/**
 * Compute the behavioural tag for an eval's `with_skill` history. Priority:
 *   broken > fixed > flaky > noisy > new > stable.
 */
function computeTag(args: {
  withSkill: Array<EvalMatrixCell | null>;
  iterations: number[];
  fingerprints: Array<string | null>;
}): EvalMatrixTag {
  const { withSkill, iterations, fingerprints } = args;

  // Compact down to (passRate, fingerprint, iteration) tuples for non-null cells.
  const points: Array<{ passRate: number; fingerprint: string | null; iteration: number }> = [];
  for (let i = 0; i < withSkill.length; i++) {
    const cell = withSkill[i];
    if (!cell) continue;
    points.push({
      passRate: cell.passRate,
      fingerprint: fingerprints[i],
      iteration: iterations[i],
    });
  }

  // BROKEN / FIXED: check last-iteration delta first — these are the highest
  // priority signals (they mean "something just happened").
  const recentSignal = detectBrokenOrFixed(points);
  if (recentSignal) return recentSignal;

  // NEW: only use this tag when there's not enough data to say anything
  // meaningful. "Eval introduced after the first matrix iteration" alone is
  // NOT enough — an eval that was introduced at iter 7 and has been stable
  // across iter 7/8/9/10 should show STABLE, not NEW forever.
  const firstIteration = points[0]?.iteration ?? iterations[0];
  if (points.length < MIN_ITERATIONS_FOR_STABILITY_TAGS) {
    // Fewer than 3 data points — "NEW" if the eval only appeared partway
    // through the matrix, otherwise fall back to STABLE.
    if (firstIteration !== iterations[0]) {
      return { kind: 'new', since: firstIteration };
    }
    return { kind: 'stable', variance: variance(points.map((p) => p.passRate)) };
  }

  const passRates = points.map((p) => p.passRate);
  const sigma = variance(passRates);

  if (sigma < STABLE_STD_DEV_MAX) {
    return { kind: 'stable', variance: sigma };
  }

  if (sigma >= FLAKY_STD_DEV_MIN) {
    // FLAKY vs NOISY: look at whether the fingerprints of adjacent diverging
    // iterations differ. If the skill changed between each flip, blame the
    // skill (FLAKY — flaky skill or flaky assertion). If the skill was
    // identical across the flips, blame the judge (NOISY).
    const divergesWithoutSkillChange = points.some((p, i) => {
      if (i === 0) return false;
      const prev = points[i - 1];
      const passRateDelta = Math.abs(p.passRate - prev.passRate);
      if (passRateDelta < 0.2) return false;
      // Both fingerprints must be known to make the call.
      if (!p.fingerprint || !prev.fingerprint) return false;
      return p.fingerprint === prev.fingerprint;
    });

    if (divergesWithoutSkillChange) {
      return { kind: 'noisy', variance: sigma };
    }
    // Find the first iteration where volatility kicked in.
    const firstFlip = points.findIndex((p, i) => {
      if (i === 0) return false;
      return Math.abs(p.passRate - points[i - 1].passRate) > 0.2;
    });
    return {
      kind: 'flaky',
      variance: sigma,
      since: firstFlip === -1 ? points[0].iteration : points[firstFlip].iteration,
    };
  }

  // Middle ground: some variance but not enough to flag as flaky.
  return { kind: 'stable', variance: sigma };
}

function detectBrokenOrFixed(
  points: Array<{ passRate: number; fingerprint: string | null; iteration: number }>,
): EvalMatrixTag | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const delta = last.passRate - prev.passRate;

  // For a call to "broken" / "fixed" we require both a significant absolute
  // delta AND a skill fingerprint change (or unknown). If the fingerprint is
  // identical we're looking at judge variance, not at the skill.
  const skillChanged =
    !last.fingerprint || !prev.fingerprint || last.fingerprint !== prev.fingerprint;

  const dropThreshold = Math.max(BROKEN_ABSOLUTE_DROP, 2 * historicalStdDev(points));
  const gainThreshold = Math.max(FIXED_ABSOLUTE_GAIN, 2 * historicalStdDev(points));

  if (delta <= -dropThreshold && skillChanged) {
    return { kind: 'broken', since: last.iteration, drop: Math.abs(delta) };
  }
  if (delta >= gainThreshold && skillChanged) {
    return { kind: 'fixed', since: last.iteration, gain: delta };
  }
  return null;
}

function historicalStdDev(
  points: Array<{ passRate: number }>,
): number {
  // Use all but the very last point as "history" so we know what the normal
  // wobble was before the final iteration.
  if (points.length < 3) return 0;
  return variance(points.slice(0, -1).map((p) => p.passRate));
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squared = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(squared);
}

// ─── Metrics computation ────────────────────────────────────────────────────

function computeMetrics(iterations: number[], rows: EvalMatrixRow[]): EvalMatrixMetrics {
  const passRateByIteration: number[] = [];
  const tokensByIteration: EvalMatrixMetrics['tokensByIteration'] = [];

  for (let i = 0; i < iterations.length; i++) {
    const withCells = rows.map((r) => r.withSkill[i]).filter((c): c is EvalMatrixCell => Boolean(c));
    const withoutCells = rows.map((r) => r.withoutSkill[i]).filter((c): c is EvalMatrixCell => Boolean(c));

    const totalAssertions = withCells.reduce((s, c) => s + c.total, 0);
    const passedAssertions = withCells.reduce((s, c) => s + c.passed, 0);
    passRateByIteration.push(totalAssertions > 0 ? passedAssertions / totalAssertions : 0);

    const tokensWith = withCells.reduce((s, c) => s + c.tokens, 0);
    const tokensWithout = withoutCells.length > 0 ? withoutCells.reduce((s, c) => s + c.tokens, 0) : null;
    const delta = tokensWithout !== null ? tokensWith - tokensWithout : null;
    tokensByIteration.push({ withSkill: tokensWith, withoutSkill: tokensWithout, delta });
  }

  const tagCounts = {
    stable: 0,
    flaky: 0,
    broken: 0,
    fixed: 0,
    new: 0,
    noisy: 0,
  };
  for (const row of rows) tagCounts[row.tag.kind]++;

  return { iterations, passRateByIteration, tokensByIteration, tagCounts };
}

function emptyMetrics(): EvalMatrixMetrics {
  return {
    iterations: [],
    passRateByIteration: [],
    tokensByIteration: [],
    tagCounts: { stable: 0, flaky: 0, broken: 0, fixed: 0, new: 0, noisy: 0 },
  };
}
