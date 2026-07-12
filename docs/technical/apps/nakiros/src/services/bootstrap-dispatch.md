# bootstrap-dispatch.ts

**Path:** `apps/nakiros/src/services/bootstrap-dispatch.ts`

Execution seam for the Project `.claude` Bootstrap feature (step 5 of `docs/redesign/features/project-bootstrap.md`). Called by `bootstrap-runner.ts`'s `dispatchApprovedProposals` once the user has approved a plan — writes every `accepted` proposal to disk through the exact same per-entity writers the sister `.claude/` experts and the V2 editor screens already use, per the `artifactType` × `target` × `content` contract documented in `nakiros-project-bootstrap`'s `references/plan-format.md`. No new write path: every actual write goes through `saveClaudeMd`, `writeRuleFile`, `writeSubagentFile`, `writeOutputStyleFile`, `saveHooksBlock`, `savePermissionsBlock`, or `saveMcpConfig` (plus a local backup helper, see below).

Two genuinely different write semantics: `hook` / `permission` writers MERGE only their own key into `settings(.local).json`, preserving everything else — safe regardless of prior content. `claudemd` / `mcp` writers REPLACE the entire target file — a pre-existing non-empty `CLAUDE.md` / `.mcp.json` is backed up to `~/.nakiros/<projectId>/bootstrap-backups/<runId>/<filename>` before being overwritten (a code-review fix — a blind whole-file replace with no existence guard was flagged as a data-loss risk).

## Exports

### `DispatchOutcome`

Outcome of writing a single proposal.

```ts
export interface DispatchOutcome {
  status: 'written' | 'failed';
  writtenPath?: string;
  backupPath?: string;
  error?: string;
}
```

### `DispatchSummary`

Aggregate counts returned alongside the mutated proposal list.

```ts
export interface DispatchSummary {
  total: number;
  written: number;
  failed: number;
  backups: Array<{ proposalId: string; path: string }>;
}
```

### `dispatchProposal`

Write one proposal via the writer matching its `artifactType`. Never throws — filesystem/parse errors from the underlying writer, or an unexpected exception, are all captured and returned as `{ status: 'failed' }`.

Blind writes (`mtimeAtRead: ''`) throughout — bootstrap proposals never follow a prior read/edit round-trip. For `rules` / `subagent` / `output-style` (genuinely new entities under the feature's "minimal config" precondition) an on-disk collision is treated as a failure rather than a silent overwrite. For `hook` / `permission` the writer merges into the settings file — safe regardless of prior content. For `claudemd` / `mcp` the writer replaces the whole target file; a pre-existing non-empty file is backed up first via `backupIfNonEmpty` (module-private). `artifactType: 'skill'` always fails with an explicit "not supported in v1" message rather than being silently dropped.

```ts
export function dispatchProposal(
  projectPath: string,
  projectId: string,
  runId: string,
  proposal: BootstrapEntityProposal,
): DispatchOutcome
```

### `dispatchBootstrapPlan`

Dispatch every `accepted` proposal in a plan. Returns a new proposal array (each accepted entry replaced by its `written` or `failed` outcome; `rejected` / already-terminal entries pass through unchanged) plus a summary for the run's final event. One failing proposal never stops the rest — every accepted proposal is attempted exactly once. `projectId`/`runId` namespace the backup directory for `claudemd`/`mcp` overwrites.

```ts
export function dispatchBootstrapPlan(
  projectPath: string,
  projectId: string,
  runId: string,
  proposals: BootstrapEntityProposal[],
): { proposals: BootstrapEntityProposal[]; summary: DispatchSummary }
```
