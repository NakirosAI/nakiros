// ---------------------------------------------------------------------------
// Eval Matrix — aggregated view of a skill's eval history
//
// The matrix is a 2D representation of all eval runs for a single skill across
// every iteration: rows = individual evals (audit-good, checklist, …), columns
// = iteration numbers. It drives the "Evolution" view in the UI.
//
// On top of the raw grid we compute per-row TAGS that summarise how each eval
// is behaving over time (STABLE / FLAKY / BROKEN / FIXED / NEW / NOISY). The
// tags use the skill fingerprint (persisted in benchmark.json) to tell apart
// a real regression (skill actually changed) from LLM-judge variance (skill
// identical across iterations, judge graded differently).
// ---------------------------------------------------------------------------

/**
 * Metadata about the cached baseline backing a `without_skill` cell. Populated
 * when the cell's `(skillName, evalName, modelFullId, evalFingerprint)` matches
 * an entry in the per-model baseline cache (`~/.nakiros/baselines/...`). Used
 * by the UI tooltip + the obsolescence toast — the actual stats live in the
 * cell itself, this carries the lookup-derived flags.
 */
export interface BaselineMeta {
  /** Epoch ms — when the baseline was originally computed. */
  computedAt: number;
  /**
   * True when the baseline's `modelFullId` is no longer in
   * `CURRENT_MODEL_FULL_IDS` (i.e. a newer minor of that model line shipped
   * since this baseline was computed). Drives the obsolescence toast.
   */
  isObsolete: boolean;
  /** Full Claude model id the baseline was computed on, e.g. `claude-opus-4-7`. */
  modelFullId: string;
}

/** Single cell in the matrix — one eval at one iteration for one config. */
export interface EvalMatrixCell {
  iteration: number;
  config: 'with_skill' | 'without_skill';
  passed: number;
  total: number;
  /** passed / total. 0 if total === 0. */
  passRate: number;
  /** Total tokens used by the claude run. */
  tokens: number;
  /** Wall-clock duration of the claude run. */
  durationMs: number;
  /**
   * Workspace-relative path to this run's artefact directory (contains
   * run.json, grading.json, outputs/, turns with blocks…). Used by the UI's
   * detail drawer.
   */
  runDir: string;
  /**
   * Set on `without_skill` cells when the underlying baseline is in the cache.
   * `null` for `with_skill` cells, for legacy iterations whose baseline never
   * made it to the cache, or when the eval's inputs changed (fingerprint
   * mismatch) so the cached baseline no longer applies.
   */
  baseline?: BaselineMeta | null;
}

/**
 * One cached baseline as exposed by `eval:listBaselines`. Used by management UI
 * (kebab menu actions, future "Manage baselines" panel).
 */
export interface BaselineEntry {
  skillName: string;
  evalName: string;
  modelFullId: string;
  evalFingerprint: string;
  /** Aggregate stats — same shape as a matrix cell's pass/total/passRate fields. */
  stats: {
    passed: number;
    failed: number;
    total: number;
    passRate: number;
    tokens: number;
    durationMs: number;
  };
  computedAt: number;
  isObsolete: boolean;
}

/**
 * Categorisation of an eval's behaviour across its history. Computed from the
 * sequence of `with_skill` cells + fingerprint comparison.
 *
 * Only one tag is set per eval. Priority when multiple signals apply:
 *   broken > fixed > flaky > noisy > new > stable.
 */
export type EvalMatrixTag =
  | {
      kind: 'stable';
      /** Standard deviation of pass_rate over the last N iterations. */
      variance: number;
    }
  | {
      kind: 'flaky';
      /** Standard deviation over the last N iterations. */
      variance: number;
      /** First iteration where flakiness was detected. */
      since: number;
    }
  | {
      kind: 'broken';
      /** Iteration where the regression happened (first iteration with the drop). */
      since: number;
      /** How much pass_rate dropped vs the previous iteration (0–1). */
      drop: number;
    }
  | {
      kind: 'fixed';
      /** Iteration where the improvement happened. */
      since: number;
      /** How much pass_rate gained vs the previous iteration (0–1). */
      gain: number;
    }
  | {
      kind: 'new';
      /** Iteration where this eval first appeared. */
      since: number;
    }
  | {
      kind: 'noisy';
      /**
       * Variance detected but the skill fingerprint didn't change between the
       * diverging iterations — points at judge variance, not at a real regression.
       */
      variance: number;
    };

/** One row of the matrix — all iterations for a single eval, plus its behaviour tag. */
export interface EvalMatrixRow {
  evalName: string;
  /**
   * `with_skill` cells aligned to `EvalMatrix.iterations`. `null` at position
   * i means this eval didn't run at that iteration (introduced later, skipped,
   * or failed before grading).
   */
  withSkill: Array<EvalMatrixCell | null>;
  /** Same shape for the baseline. Entire array may be all-null if evals were
   *  run without baseline. */
  withoutSkill: Array<EvalMatrixCell | null>;
  tag: EvalMatrixTag;
}

/** Per-iteration aggregates + tag counts rendered in the matrix header. */
export interface EvalMatrixMetrics {
  /** Iteration numbers in ascending order. */
  iterations: number[];
  /** One entry per iteration — mean with_skill pass rate across all evals. */
  passRateByIteration: number[];
  /** Per-iteration tokens: with_skill aggregate, baseline aggregate, delta. */
  tokensByIteration: Array<{
    withSkill: number;
    withoutSkill: number | null;
    delta: number | null;
  }>;
  /** Tag counts for the summary badges in the header. */
  tagCounts: {
    stable: number;
    flaky: number;
    broken: number;
    fixed: number;
    new: number;
    noisy: number;
  };
}

/**
 * What kind of run produced an iteration — drives UI affordances (sparkline
 * marker color, matrix column styling, diff selector tags).
 *
 * - `skill`: classic eval iteration that ran `with_skill` (and possibly
 *   `without_skill` on cache miss for the per-model baseline). The bulk of
 *   what shows up in the Evolution view.
 * - `baseline`: a baseline-only run triggered via "Recalculer la baseline".
 *   Only `without_skill` data, no `with_skill` to display. Persisted as a
 *   real iteration so the user can audit baseline history, compare it
 *   against skill iterations in the diff overlay, and see it on the
 *   sparkline as a distinct marker.
 */
export type EvalIterationKind = 'skill' | 'baseline';

/** Complete eval matrix consumed by the Evolution view — iterations × evals grid + metrics. */
export interface EvalMatrix {
  skillName: string;
  /** Iteration numbers in ascending order — these are the matrix columns. */
  iterations: number[];
  /**
   * Fingerprint captured at each iteration. `null` on iterations that pre-date
   * the fingerprint feature. Aligned to `iterations`.
   */
  fingerprints: Array<string | null>;
  /**
   * Claude model id used to run each iteration (e.g. `claude-opus-4-7`).
   * `null` on iterations that pre-date the model selector (the CLI default
   * was used). Aligned to `iterations`.
   */
  models: Array<string | null>;
  /**
   * Run kind for each iteration — `'skill'` or `'baseline'`. Aligned to
   * `iterations`. Defaults to `'skill'` for benchmarks written before the
   * field landed (backward-compat).
   */
  kinds: EvalIterationKind[];
  rows: EvalMatrixRow[];
  metrics: EvalMatrixMetrics;
}

/** Request payload for the `eval:getMatrix` IPC channel. */
export interface GetEvalMatrixRequest {
  scope: import('./project.js').SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
  /**
   * Direct path to a skill directory, overriding the scope-based resolution.
   * Used by fix runs so the matrix reflects the in-progress temp copy rather
   * than the real persisted skill.
   */
  skillDirOverride?: string;
}

/** Request payload for the `eval:listBaselines` IPC channel. */
export interface ListBaselinesRequest {
  scope: import('./project.js').SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
}

/** Response payload for the `eval:listBaselines` IPC channel. */
export interface ListBaselinesResponse {
  baselines: BaselineEntry[];
}

/** Request payload for the `eval:loadIterationRun` IPC channel. */
export interface LoadIterationRunRequest {
  scope: import('./project.js').SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
  iteration: number;
  evalName: string;
  config: 'with_skill' | 'without_skill';
  /** Same role as on `GetEvalMatrixRequest` — points at the fix temp dir. */
  skillDirOverride?: string;
}

/** Full artefact bundle for a single iteration run (raw run + grading + outputs + diff + timing). */
export interface IterationRunArtifact {
  /** Raw `run.json` contents (turns + blocks + tools) — null if missing. */
  run: import('./project.js').SkillEvalRun | null;
  /** Raw `grading.json` — detailed assertion results. */
  grading: {
    eval_id: string;
    eval_name: string;
    skill_name: string;
    iteration: string;
    config: 'with_skill' | 'without_skill';
    timestamp: string;
    grader_model: string;
    assertion_results: Array<{
      type: 'script' | 'llm' | 'manual';
      text: string;
      passed: boolean;
      evidence: string;
    }>;
    summary: { passed: number; failed: number; total: number; pass_rate: number };
  } | null;
  /** Output files (relative paths + metadata). */
  outputs: import('./project.js').EvalRunOutputEntry[];
  /** Content of `diff.patch` if the run used a git-worktree sandbox. */
  diffPatch: string | null;
  /** Timing — `{ total_tokens, duration_ms }` from timing.json. */
  timing: { totalTokens: number; durationMs: number } | null;
}
