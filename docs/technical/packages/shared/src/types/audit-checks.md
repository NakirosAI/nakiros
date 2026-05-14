# audit-checks.ts

**Path:** `packages/shared/src/types/audit-checks.ts`

Defines the two-artefact protocol the audit runner uses to drive live sidebar progress. The skill writes `audit-manifest.json` once at start (static taxonomy) and appends to `audit-progress.jsonl` (one line per check result). The daemon re-reads both between turns and broadcasts diffs so the frontend can render a live "X/23 checks done" view without round-tripping through the final markdown report.

## Exports

### `AuditCheckSeverity`

```ts
export type AuditCheckSeverity = 'critical' | 'warn' | 'info';
```

Severity of a finding produced by a failing check. Drives the sidebar tone.

### `AuditCheckResult`

```ts
export type AuditCheckResult = 'pass' | 'fail' | 'na';
```

Outcome of a single check after evaluation. `na` counts as a pass in the score.

### `AuditCheckSpec`

Static spec for a single check. Lives in the manifest the skill copies into the run workdir at the start of every audit. The spec is identical across runs of the same skill-factory version — the manifest is the source of truth the frontend uses to render the sidebar skeleton.

```ts
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
```

### `AuditSection`

Group of checks shown as a single row in the sidebar progress list.

```ts
export interface AuditSection {
  id: string;
  label: string;
  /** Ordered list of check ids in this section. */
  checks: string[];
}
```

### `AuditManifest`

Complete static taxonomy of the audit. Written by the skill (or its helper script) into `outputs/audit-manifest.json` before any check is evaluated.

```ts
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
```

### `AuditCheckOutcome`

One check result, appended live to `outputs/audit-progress.jsonl`. The daemon emits a `check_result` event per new line it observes between turns.

```ts
export interface AuditCheckOutcome {
  /** References {@link AuditCheckSpec.id}. */
  checkId: string;
  result: AuditCheckResult;
  /** One-sentence explanation surfaced as the finding subtitle on `fail`. */
  detail: string;
}
```
