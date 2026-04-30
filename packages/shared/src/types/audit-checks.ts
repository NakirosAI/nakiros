/**
 * Structured audit check protocol.
 *
 * The audit-runner streams two artefacts produced by the `nakiros-skill-factory`
 * skill while it audits a target skill:
 *
 *  - `outputs/audit-manifest.json` — written ONCE at the start of the run. The
 *    full taxonomy: which checks the audit will perform, grouped in sections,
 *    with their finding code + severity. Stable per skill-factory version.
 *  - `outputs/audit-progress.jsonl` — appended one line per check as the audit
 *    progresses. Each line is an {@link AuditCheckOutcome}.
 *
 * The daemon re-reads both files between turns and broadcasts the diff via
 * `AuditRunEvent`, so the frontend can drive a live "X/23 checks done" UI
 * without round-tripping through the markdown report.
 */

/** Severity of a finding produced by a failing check. Drives the sidebar tone. */
export type AuditCheckSeverity = 'critical' | 'warn' | 'info';

/** Outcome of a single check after evaluation. `na` counts as a pass in the score. */
export type AuditCheckResult = 'pass' | 'fail' | 'na';

/**
 * Static spec for a single check. Lives in the manifest the skill copies into
 * the run workdir at the start of every audit. The spec is identical across
 * runs of the same skill-factory version — the manifest is the source of truth
 * the frontend uses to render the sidebar skeleton (sections + check labels).
 */
export interface AuditCheckSpec {
  /** Stable slug, e.g. `frontmatter.name_match`. Survives reordering / renumbering. */
  id: string;
  /** Human-readable label shown in the sidebar / report. */
  label: string;
  /** Section id this check belongs to — references {@link AuditSection.id}. */
  section: string;
  /** Severity to assign to the finding when the check fails. */
  severityIfFail: AuditCheckSeverity;
  /** Short uppercase code shown in the "Findings live" panel (`NAME_MISMATCH`). */
  findingCode: string;
}

/** Group of checks shown as a single row in the sidebar progress list. */
export interface AuditSection {
  id: string;
  label: string;
  /** Ordered list of check ids in this section. */
  checks: string[];
}

/**
 * Complete static taxonomy of the audit. Written by the skill (or its helper
 * script) into `outputs/audit-manifest.json` before any check is evaluated.
 */
export interface AuditManifest {
  /** Skill being audited. */
  skillName: string;
  /** `sections.flatMap(s => s.checks).length` — pre-computed for the UI. */
  totalChecks: number;
  /** Skill-factory schema version, in case the shape evolves. */
  schemaVersion: 1;
  sections: AuditSection[];
  checks: AuditCheckSpec[];
}

/**
 * One check result, appended live to `outputs/audit-progress.jsonl`. The
 * daemon emits a `check_result` event per new line it observes between turns.
 */
export interface AuditCheckOutcome {
  /** References {@link AuditCheckSpec.id}. */
  checkId: string;
  result: AuditCheckResult;
  /** One-sentence explanation surfaced as the finding subtitle on `fail`. */
  detail: string;
}
