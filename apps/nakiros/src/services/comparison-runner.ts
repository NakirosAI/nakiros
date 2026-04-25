import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type {
  ComparisonFingerprintStatus,
  ComparisonMatrix,
  ComparisonReuseSummary,
  ComparisonRow,
  ComparisonSummary,
  EvalRunEvent,
  RunComparisonRequest,
  RunComparisonResponse,
  StartEvalRunRequest,
} from '@nakiros/shared';

import { startEvalRuns } from './eval-runner.js';
import { computeSkillFingerprint } from './skill-fingerprint.js';
import { collectConfigStats, type EvalConfigStats } from './eval-benchmark.js';

// ---------------------------------------------------------------------------
// Eval Model Comparison — orchestrates N models × M evals into a dedicated
// storage folder that's isolated from the Evolution iteration history.
//
// Layout: {skillDir}/evals/comparisons/<comparisonId>/
//           comparison.json
//           <model>/eval-<name>/with_skill/{grading.json,timing.json,…}
//           <model>/eval-<name>/without_skill/…
//
// Reuse optimisation: when the skill fingerprint hasn't changed since the last
// Evolution iteration AND that iteration used one of the requested models,
// we physically copy the artefacts from the iteration dir into the comparison
// dir rather than re-running the same skill on the same model. This is the
// costliest case (Opus) so the saving is meaningful.
//
// If the fingerprint has changed, we re-run the last-iteration's model too
// (including its baseline) — otherwise we'd be comparing stale Opus to fresh
// Haiku, which would be misleading.
// ---------------------------------------------------------------------------

/** Options passed by the `comparison:run` handler to {@link startComparisonRun}. */
export interface StartComparisonOptions {
  resolveSkillDir(request: RunComparisonRequest): string;
  onEvent(event: EvalRunEvent): void;
}

// ─── Iteration introspection ────────────────────────────────────────────────

interface LatestIterationInfo {
  iteration: number;
  iterDir: string;
  model: string | null;
  fingerprint: string | null;
}

function readLatestIteration(skillDir: string): LatestIterationInfo | null {
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
    const iterDir = join(workspaceDir, `iteration-${iteration}`);
    const benchmarkPath = join(iterDir, 'benchmark.json');
    if (!existsSync(benchmarkPath)) continue;
    // A benchmark.json only proves the batch finished (possibly via early
    // stop). Reuse requires every with_skill eval to be fully graded —
    // otherwise we would copy a half-empty folder into the comparison.
    if (!isIterationComplete(iterDir)) continue;
    try {
      const raw = JSON.parse(readFileSync(benchmarkPath, 'utf8')) as {
        skill_fingerprint?: string | null;
        model?: string | null;
      };
      return {
        iteration,
        iterDir,
        model: raw.model ?? null,
        fingerprint: raw.skill_fingerprint ?? null,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * An iteration counts as complete only when every eval in it has a gradable
 * `with_skill` run. We check `grading.json` directly (written after grading
 * succeeds) because `run.json` can report `completed` even when the grader
 * was never reached, and `benchmark.json` gets written regardless of whether
 * individual runs finished cleanly.
 */
function isIterationComplete(iterDir: string): boolean {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(iterDir, { withFileTypes: true });
  } catch {
    return false;
  }
  const evalDirs = entries.filter((e) => e.isDirectory() && e.name.startsWith('eval-'));
  if (evalDirs.length === 0) return false;
  for (const entry of evalDirs) {
    const gradingPath = join(iterDir, entry.name, 'with_skill', 'grading.json');
    if (!existsSync(gradingPath)) return false;
    try {
      const raw = JSON.parse(readFileSync(gradingPath, 'utf8')) as {
        summary?: { total?: number };
      };
      if (typeof raw.summary?.total !== 'number' || raw.summary.total === 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Pre-flight check for the comparison UI. Returns the current fingerprint,
 * the last iteration's info, and whether the two match — if they do, the
 * runner can copy artefacts instead of re-running that model. When they
 * don't, the last-iteration model will be re-run alongside the others.
 */
export function getComparisonFingerprintStatus(skillDir: string): ComparisonFingerprintStatus {
  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = computeSkillFingerprint(skillDir);
  } catch {
    currentFingerprint = null;
  }
  const last = readLatestIteration(skillDir);
  const canReuseLastIteration =
    !!last && !!currentFingerprint && last.fingerprint === currentFingerprint;
  return {
    currentFingerprint,
    lastIteration: last
      ? { iteration: last.iteration, model: last.model, fingerprint: last.fingerprint }
      : null,
    canReuseLastIteration,
  };
}

// ─── Storage helpers ────────────────────────────────────────────────────────

/** Filesystem-safe timestamp used as comparison folder name (and stable id). */
function generateComparisonId(): string {
  // Drop milliseconds + colons so the folder name is portable across FS.
  // Example: 2026-04-22T10-30-00Z
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+/, '');
}

function comparisonsRoot(skillDir: string): string {
  return join(skillDir, 'evals', 'comparisons');
}

function comparisonDirFor(skillDir: string, comparisonId: string): string {
  return join(comparisonsRoot(skillDir), comparisonId);
}

function copyIterationArtefactsForModel(srcIterDir: string, targetModelDir: string): void {
  // iteration dir layout: eval-<name>/{with_skill,without_skill}/…
  // We mirror the same layout inside targetModelDir so the comparison viewer
  // can rely on the identical shape.
  mkdirSync(targetModelDir, { recursive: true });
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(srcIterDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('eval-')) continue;
    cpSync(join(srcIterDir, entry.name), join(targetModelDir, entry.name), { recursive: true });
  }
}

// ─── Comparison.json shape (persisted on disk) ──────────────────────────────

interface PersistedComparison {
  skill_name: string;
  comparison_id: string;
  timestamp: string;
  skill_fingerprint: string | null;
  models: string[];
  reuse: Record<string, { from_iteration: number }>;
  per_model: Record<
    string,
    {
      per_eval: Record<
        string,
        {
          with_skill?: EvalConfigStats;
          without_skill?: EvalConfigStats;
        }
      >;
    }
  >;
}

function scanModelStats(
  modelDir: string,
): PersistedComparison['per_model'][string]['per_eval'] {
  const result: PersistedComparison['per_model'][string]['per_eval'] = {};
  if (!existsSync(modelDir)) return result;
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(modelDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('eval-')) continue;
    const evalName = entry.name.replace(/^eval-/, '');
    const evalDir = join(modelDir, entry.name);
    const withSkill = collectConfigStats(evalDir, 'with_skill');
    const withoutSkill = collectConfigStats(evalDir, 'without_skill');
    result[evalName] = {};
    if (withSkill) result[evalName].with_skill = withSkill;
    if (withoutSkill) result[evalName].without_skill = withoutSkill;
  }
  return result;
}

function writeComparisonJson(args: {
  skillDir: string;
  skillName: string;
  comparisonId: string;
  fingerprint: string | null;
  models: string[];
  reused: Record<string, number>;
  timestamp: string;
}): void {
  const dir = comparisonDirFor(args.skillDir, args.comparisonId);
  const perModel: PersistedComparison['per_model'] = {};
  for (const model of args.models) {
    perModel[model] = { per_eval: scanModelStats(join(dir, model)) };
  }
  const reuse: PersistedComparison['reuse'] = {};
  for (const [model, iteration] of Object.entries(args.reused)) {
    reuse[model] = { from_iteration: iteration };
  }
  const payload: PersistedComparison = {
    skill_name: args.skillName,
    comparison_id: args.comparisonId,
    timestamp: args.timestamp,
    skill_fingerprint: args.fingerprint,
    models: args.models,
    reuse,
    per_model: perModel,
  };
  writeFileSync(join(dir, 'comparison.json'), JSON.stringify(payload, null, 2), 'utf8');
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Kick off a comparison run. Returns immediately with the runIds — the UI
 * subscribes to `eval:event` to follow progress.
 */
export async function startComparisonRun(
  request: RunComparisonRequest,
  options: StartComparisonOptions,
): Promise<RunComparisonResponse> {
  const skillDir = options.resolveSkillDir(request);
  if (!existsSync(skillDir)) {
    throw new Error(`Skill directory not found: ${skillDir}`);
  }
  if (!request.models || request.models.length === 0) {
    throw new Error('At least one model must be selected for the comparison');
  }

  const comparisonId = generateComparisonId();
  const comparisonDir = comparisonDirFor(skillDir, comparisonId);
  mkdirSync(comparisonDir, { recursive: true });

  const timestamp = new Date().toISOString();
  let fingerprint: string | null = null;
  try {
    fingerprint = computeSkillFingerprint(skillDir);
  } catch {
    fingerprint = null;
  }
  const last = readLatestIteration(skillDir);
  const canReuseFromLast =
    !!last && !!fingerprint && last.fingerprint === fingerprint;

  const reusedFromIteration: Record<string, number | null> = {};
  const reusedNumeric: Record<string, number> = {};
  const runIds: string[] = [];
  const modelsThatWillRun: string[] = [];

  // ── Decide reuse vs fresh for each model ─────────────────────────────────
  for (const model of request.models) {
    const modelDir = join(comparisonDir, model);
    if (canReuseFromLast && last!.model === model) {
      copyIterationArtefactsForModel(last!.iterDir, modelDir);
      reusedFromIteration[model] = last!.iteration;
      reusedNumeric[model] = last!.iteration;
    } else {
      reusedFromIteration[model] = null;
      modelsThatWillRun.push(model);
    }
  }

  // ── Launch fresh runs for the remaining models ──────────────────────────
  // Synthetic iteration number used on the SkillEvalRun records so they are
  // self-describing but can't collide with real Evolution iterations.
  const syntheticIteration = 0;
  const evalRequestBase: StartEvalRunRequest = {
    scope: request.scope,
    projectId: request.projectId,
    pluginName: request.pluginName,
    marketplaceName: request.marketplaceName,
    skillName: request.skillName,
    skillDirOverride: request.skillDirOverride,
    includeBaseline: true,
    maxConcurrent: request.maxConcurrent,
  };

  // Wrap onEvent so we can finalise comparison.json once every fresh run is
  // done. Reused models are already in place on disk, so we only wait for the
  // fresh ones.
  const pendingRunIds = new Set<string>();
  let finalised = false;
  const wrappedOnEvent = (event: EvalRunEvent): void => {
    options.onEvent(event);
    if (event.event.type === 'done' && pendingRunIds.has(event.runId)) {
      pendingRunIds.delete(event.runId);
      if (!finalised && pendingRunIds.size === 0) {
        finalised = true;
        try {
          writeComparisonJson({
            skillDir,
            skillName: request.skillName,
            comparisonId,
            fingerprint,
            models: request.models,
            reused: reusedNumeric,
            timestamp,
          });
        } catch (err) {
          console.error('[comparison-runner] Failed to write comparison.json:', err);
        }
      }
    }
  };

  for (const model of modelsThatWillRun) {
    const modelDir = join(comparisonDir, model);
    mkdirSync(modelDir, { recursive: true });
    const response = await startEvalRuns(
      { ...evalRequestBase, model },
      {
        resolveSkillDir: () => skillDir,
        onEvent: wrappedOnEvent,
        artifactRootOverride: modelDir,
        skipBenchmarkWrite: true,
        fixedIteration: syntheticIteration,
      },
    );
    for (const id of response.runIds) {
      pendingRunIds.add(id);
      runIds.push(id);
    }
  }

  // Edge case: every model was reused — no fresh run, finalise immediately.
  if (modelsThatWillRun.length === 0) {
    writeComparisonJson({
      skillDir,
      skillName: request.skillName,
      comparisonId,
      fingerprint,
      models: request.models,
      reused: reusedNumeric,
      timestamp,
    });
  }

  const reuseSummary: ComparisonReuseSummary = { reusedFromIteration };
  return { comparisonId, runIds, reuseSummary };
}

// ─── List + load for the UI ─────────────────────────────────────────────────

/**
 * List every previously-run comparison for a skill, newest-first. Reads each
 * `comparisons/<id>/comparison.json` and aggregates per-model pass rates for
 * the list view tile.
 */
export function listComparisons(skillDir: string): ComparisonSummary[] {
  const root = comparisonsRoot(skillDir);
  if (!existsSync(root)) return [];
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries: ComparisonSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, 'comparison.json');
    if (!existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as PersistedComparison;
      const passRateByModel: Record<string, number> = {};
      for (const model of raw.models ?? []) {
        const perEval = raw.per_model?.[model]?.per_eval ?? {};
        const totals = Object.values(perEval)
          .map((e) => e.with_skill)
          .filter((c): c is EvalConfigStats => Boolean(c));
        const total = totals.reduce((s, c) => s + c.total, 0);
        const passed = totals.reduce((s, c) => s + c.passed, 0);
        passRateByModel[model] = total > 0 ? passed / total : 0;
      }
      summaries.push({
        comparisonId: raw.comparison_id ?? entry.name,
        timestamp: raw.timestamp ?? '',
        models: raw.models ?? [],
        passRateByModel,
      });
    } catch {
      // skip malformed
    }
  }
  // Newest first
  summaries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return summaries;
}

/**
 * Load the full per-model × per-eval matrix for one comparison. Each cell
 * carries `reusedFromIteration` so the UI can render a subtle hint on columns
 * that were copied from an Evolution iteration (no fresh tokens spent).
 */
export function loadComparisonMatrix(
  skillDir: string,
  comparisonId: string,
): ComparisonMatrix | null {
  const file = join(comparisonDirFor(skillDir, comparisonId), 'comparison.json');
  if (!existsSync(file)) return null;
  let raw: PersistedComparison;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as PersistedComparison;
  } catch {
    return null;
  }

  const evalNames = new Set<string>();
  for (const model of raw.models) {
    const perEval = raw.per_model?.[model]?.per_eval ?? {};
    for (const name of Object.keys(perEval)) evalNames.add(name);
  }

  const rows: ComparisonRow[] = [];
  for (const evalName of Array.from(evalNames).sort()) {
    const withSkill: ComparisonRow['withSkill'] = [];
    const withoutSkill: ComparisonRow['withoutSkill'] = [];
    for (const model of raw.models) {
      const cell = raw.per_model?.[model]?.per_eval?.[evalName];
      const modelDir = join(skillDir, 'evals', 'comparisons', comparisonId, model);
      const reusedIter = raw.reuse?.[model]?.from_iteration ?? null;
      withSkill.push(
        cell?.with_skill
          ? {
              evalName,
              model,
              config: 'with_skill',
              passed: cell.with_skill.passed,
              total: cell.with_skill.total,
              passRate: cell.with_skill.pass_rate,
              tokens: cell.with_skill.tokens,
              durationMs: cell.with_skill.duration_ms,
              runDir: join(modelDir, `eval-${evalName}`, 'with_skill'),
              reusedFromIteration: reusedIter,
            }
          : null,
      );
      withoutSkill.push(
        cell?.without_skill
          ? {
              evalName,
              model,
              config: 'without_skill',
              passed: cell.without_skill.passed,
              total: cell.without_skill.total,
              passRate: cell.without_skill.pass_rate,
              tokens: cell.without_skill.tokens,
              durationMs: cell.without_skill.duration_ms,
              runDir: join(modelDir, `eval-${evalName}`, 'without_skill'),
              reusedFromIteration: reusedIter,
            }
          : null,
      );
    }
    rows.push({ evalName, withSkill, withoutSkill });
  }

  const perModel = raw.models.map((model, modelIdx) => {
    const cells = rows
      .map((r) => r.withSkill[modelIdx])
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const total = cells.reduce((s, c) => s + c.total, 0);
    const passed = cells.reduce((s, c) => s + c.passed, 0);
    const tokens = cells.reduce((s, c) => s + c.tokens, 0);
    return {
      model,
      passRate: total > 0 ? passed / total : 0,
      tokens,
      reused: raw.reuse?.[model] !== undefined,
    };
  });

  return {
    skillName: raw.skill_name,
    comparisonId,
    timestamp: raw.timestamp,
    fingerprint: raw.skill_fingerprint,
    models: raw.models,
    rows,
    perModel,
  };
}
