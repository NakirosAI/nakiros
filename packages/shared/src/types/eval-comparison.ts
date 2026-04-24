// ---------------------------------------------------------------------------
// Eval Model Comparison — A/B/C view across Haiku / Sonnet / Opus
//
// The Evolution matrix tells you how a skill evolves over time (mono-model).
// A Comparison tells you how a SINGLE skill snapshot performs across multiple
// models — so the user can decide "Sonnet is enough, I can drop Opus here".
//
// Storage layout (separate from evals/workspace/ so the Evolution matrix is
// never polluted):
//   {skillDir}/evals/comparisons/<timestamp>/
//     comparison.json
//     <model>/eval-<name>/with_skill/{grading,timing,diff,outputs}/
//     <model>/eval-<name>/without_skill/{grading,timing,diff,outputs}/
//
// Reuse strategy: when the skill fingerprint has not changed since the last
// Evolution iteration AND that iteration used one of the requested models,
// the comparison runner copies the iteration's artefacts into the comparison
// folder instead of re-running them. Saves real money on Opus.
// ---------------------------------------------------------------------------

import type { SkillScope } from './project.js';

/** Request to launch a new comparison. */
export interface RunComparisonRequest {
  scope: SkillScope;
  pluginName?: string;
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  /** Claude model aliases to compare (e.g. `['haiku', 'sonnet', 'opus']`). */
  models: string[];
  /** Override the resolved skill directory (same role as on eval requests). */
  skillDirOverride?: string;
  /** Max number of claude subprocesses across all models. Defaults to 4. */
  maxConcurrent?: number;
}

/** Response returned by the comparison runner when a new comparison is launched. */
export interface RunComparisonResponse {
  /** Folder name under `evals/comparisons/` (timestamp-based). */
  comparisonId: string;
  /** runIds that will emit `eval:event` while the comparison is running. */
  runIds: string[];
  /** Which models were reused from an existing iteration vs freshly launched. */
  reuseSummary: ComparisonReuseSummary;
}

/** Summary of which models the comparison reused from prior Evolution iterations. */
export interface ComparisonReuseSummary {
  /** Model alias → `iteration` we copied from (null when launched fresh). */
  reusedFromIteration: Record<string, number | null>;
}

/**
 * Pre-flight info so the UI can warn the user BEFORE launching: "the skill has
 * changed since iter 4, so Opus will be re-run alongside Haiku and Sonnet".
 */
export interface ComparisonFingerprintStatus {
  /** Current fingerprint of the on-disk skill. Null when fingerprinting fails. */
  currentFingerprint: string | null;
  /** Last Evolution iteration's info — null when the skill has no iterations yet. */
  lastIteration: {
    iteration: number;
    model: string | null;
    fingerprint: string | null;
  } | null;
  /**
   * True when `currentFingerprint` matches the last iteration's fingerprint.
   * When false, the comparison runner must re-run the last iteration's model
   * too (otherwise the cells would mix stale vs fresh skill versions).
   */
  canReuseLastIteration: boolean;
}

/** Single cell in the comparison matrix — one eval at one model. */
export interface ComparisonCell {
  evalName: string;
  model: string;
  config: 'with_skill' | 'without_skill';
  passed: number;
  total: number;
  passRate: number;
  tokens: number;
  durationMs: number;
  /** Workspace-relative path to this run's artefact directory. */
  runDir: string;
  /**
   * True when this cell was COPIED from an Evolution iteration (fingerprint
   * matched). Null/false when the cell was freshly run. Shown as a subtle hint
   * in the UI so the user knows which columns cost real tokens.
   */
  reusedFromIteration?: number | null;
}

/** One row of the comparison matrix — all per-model cells for a single eval. */
export interface ComparisonRow {
  evalName: string;
  /** Per-model cells for the `with_skill` config, aligned to `ComparisonMatrix.models`. */
  withSkill: Array<ComparisonCell | null>;
  /** Baseline cells (`without_skill`). May be all-null if baseline was skipped. */
  withoutSkill: Array<ComparisonCell | null>;
}

/** Aggregated comparison matrix consumed by the A/B/C view in the UI. */
export interface ComparisonMatrix {
  skillName: string;
  /** Folder name under `evals/comparisons/`. */
  comparisonId: string;
  /** ISO timestamp of when the comparison was launched. */
  timestamp: string;
  /** Skill fingerprint at the time the comparison ran. */
  fingerprint: string | null;
  /** Models compared, in the order the UI should render columns. */
  models: string[];
  rows: ComparisonRow[];
  /** Per-model aggregates for the summary row. */
  perModel: Array<{
    model: string;
    passRate: number;
    tokens: number;
    reused: boolean;
  }>;
}

/** Compact summary of a comparison, used by the list view tile. */
export interface ComparisonSummary {
  comparisonId: string;
  timestamp: string;
  models: string[];
  /** Top-line with_skill pass rate per model (for the list view tile). */
  passRateByModel: Record<string, number>;
}

// ─── IPC request/response shapes ────────────────────────────────────────────

/** Request payload for the `comparison:getMatrix` IPC channel. */
export interface GetComparisonMatrixRequest {
  scope: SkillScope;
  pluginName?: string;
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  comparisonId: string;
  skillDirOverride?: string;
}

/** Request payload for the `comparison:list` IPC channel. */
export interface ListComparisonsRequest {
  scope: SkillScope;
  pluginName?: string;
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  skillDirOverride?: string;
}

/** Request payload for the `comparison:getFingerprintStatus` IPC channel. */
export interface GetComparisonFingerprintStatusRequest {
  scope: SkillScope;
  pluginName?: string;
  marketplaceName?: string;
  projectId?: string;
  skillName: string;
  skillDirOverride?: string;
}
