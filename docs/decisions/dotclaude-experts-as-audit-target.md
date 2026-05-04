# `.claude/` experts as audit / fix / create targets

> Decision · 2026-05-03 · supersedes the short-lived attempt at a dedicated
> `kind: 'claudemd'` runner.

## Context

Nakiros ships a family of bundled "experts" — one per `.claude/` element type
— that produce structured artefacts (audit manifest, audit progress JSONL,
audit report markdown, diff summaries, etc.) when invoked through a Claude
Code slash-command. The first expert is `nakiros-claudemd-expert`; six more
follow (`rules`, `subagents`, `hooks`, `permissions`, `mcp`,
`output-styles`).

The product surfaces the same three actions on each `.claude/` editor screen:

- **Create** — the file does not exist yet, run the expert in bootstrap mode.
- **Audit** — score the existing file against a checklist.
- **Fix** — patch the file from the latest audit findings + the project's
  aggregated friction signals.

These actions reuse the existing `audit-runner` / `fix-runner` /
`create-runner` services. The runner itself, the persisted run state, and
the entire `RunScreen` UI (header, sidebar, completed-report card, diff
viewer, dock entry) are reused **verbatim**. What changes is the wording, a
few skill-only buttons, and where the artefacts are archived.

## Why not a dedicated runner kind

The first attempt introduced `kind: 'claudemd'` with its own runner, IPC
channels, `ClaudeMdRun` type and frontend store branch. Result: every
existing UI surface (`AuditCompletedReport`, `RunDock`, `RunSidePanel`,
`NewRunHeader`) had to grow a parallel branch, or — worse — a stripped-down
placeholder. The runs ended up as second-class citizens with no completed
report rendering, no archived history, no dock dispatch, no progress
sidebar.

**Lesson:** we already have a polished pipeline for `audit / fix / create`.
A `.claude/` expert is just an audit / fix / create with a different
target. Don't fork the pipeline; adapt it.

## Contract

### `claudemdTarget` carrier

`StartAuditRequest` and `AuditRun` both carry an optional
`claudemdTarget?: ClaudeMdTargetContext` field. When set, the runner knows
the run targets a CLAUDE.md instead of a skill. The standard `scope` /
`skillName` pair always points to the bundled expert (currently
`scope: 'nakiros-bundled'`, `skillName: 'nakiros-claudemd-expert'`).

```ts
interface ClaudeMdTargetContext {
  projectId: string;
  projectPath: string;
  scope: ClaudeMdScope;          // 'root' | 'claude-dir' | 'local'
  mode: ClaudeMdRunMode;          // 'audit' | 'fix' | 'create'
  targetPath: string;             // resolved absolute path of the CLAUDE.md
}
```

### What changes in the runner when `claudemdTarget` is present

| Step | Default behaviour | When `claudemdTarget` is set |
|---|---|---|
| `prepareWorkdir` (fix-runner) | copy skill source into tmp workdir | symlink the bundled expert under `.claude/skills/<expert>` so the slash-command resolves; do **not** copy |
| `prepareWorkdir` create-mode existence check | error if `skillDir` already exists | skipped — the bundled expert always exists |
| `buildFirstPrompt` | `/<factory> <mode> <skillName>` | `/<expert> <mode>` + injected context (target path, scope label, whether the file exists) |
| `archiveReport` (audit-runner) | copy report into `{skillDir}/audits/audit-{ISO}.md` | copy into `~/.nakiros/<projectId>/claudemd/audit/audit-<scope>-<ISO>.md` |
| `findActiveForTarget` | (scope, projectId, skillName) tuple | additionally narrow by `(claudemdTarget.projectPath, claudemdTarget.scope)` so two scopes within the same project don't collapse |
| `rehydrate` | restore the standard `AuditRun` fields | also restore `claudemdTarget` so the live UI keeps the right title |

Everything else — workdir lifecycle, session JSONL parsing, manifest
streaming, `audit-progress.jsonl` polling, fix-targets / fix-findings tail —
is **unchanged**.

### What changes in the frontend

The frontend never branches on a different `kind`. Instead, every UI
surface that has user-visible strings reads them from a small helper:

```ts
import { runDisplayContext } from '../lib/run-display';

const display = runDisplayContext(runKind, run);
// → { title, kindLabel, actionVerb, targetNoun, isClaudemd, scopeLabel }
```

Surfaces that consume it:

- `RunScreen` — composes the title, swaps the reject-prompt copy, hides
  skill-only buttons (`onLaunchEval`) when `display.isClaudemd`.
- `NewRunHeader` — accepts a `kindLabelOverride` prop fed from
  `display.kindLabel`.
- `RunSidePanel` — receives `targetNoun` and swaps the deploy / discard /
  hint copy via a `labels` table.
- `useAgentRunsSync` — when `run.claudemdTarget` is set, emits an
  `AgentRun` with `target.type: 'claudemd'` and a CLAUDE.md-focused title.
- `RunDock` — branches on `target.type === 'claudemd'` to resolve a
  display label.

### Archive layout

```
~/.nakiros/<projectId>/claudemd/audit/audit-<scope>-<ISO>.md
```

The filename embeds the scope and a `-`-only ISO timestamp (same encoding as
the runner's run id timestamp). `claudemd:listAudits` parses the filename to
group / sort without re-reading every file; the score is scraped from the
markdown body via a single regex over the first ~80 lines.

## Replicating for the next experts

When `nakiros-rules-expert` (or any of the remaining six) ships, the steps
to wire it as audit / fix / create target are:

1. **Type the target context.** Add a sibling of `ClaudeMdTargetContext` in
   `packages/shared/src/types/project.ts` (or extend the existing one if
   the carrier is identical — it usually is, only the path resolution
   differs).
2. **Pass-through on the request.** Add the optional field to
   `StartAuditRequest`. No new IPC channels needed for the runs themselves.
3. **Branches in the runners.** Mirror the table above:
   - `buildFirstPrompt` — read the request and build
     `/<expert> <mode> ...` with the right injected context.
   - `archiveReport` (audit) — write under
     `~/.nakiros/<projectId>/<element>/audit/audit-...`.
   - `prepareWorkdir` — skip the skill copy, symlink the bundled expert.
   - `findActiveForTarget` — narrow further by element-specific keys.
   - `rehydrate` — restore the new field.
4. **Frontend launcher.** Add `launch<Element>` in `run-launcher.ts` that
   builds a `StartAuditRequest` with `scope: 'nakiros-bundled'` +
   `skillName: 'nakiros-<element>-expert'` and dispatches to the right
   `start*` IPC.
5. **Display helper.** Extend `runDisplayContext` so `targetNoun` /
   `kindLabel` reflect the new element type. Every surface picks up the
   change automatically.
6. **History panel.** Mirror `AuditHistorySection` /
   `AuditReportOverlay` in the element-specific screen — copy-paste with
   the right `listAudits` IPC and the right "fix" callback.

The bundled expert itself follows the [Skill Factory pattern](../../apps/nakiros/bundled-skills/nakiros-skill-factory/SKILL.md):
SKILL.md + `references/` + `audit-manifest.json` + `scripts/run-static-checks.mjs`.

## Anti-patterns

- **Don't introduce a new `AgentRunKind`** for an element type. The kind
  represents the action (`audit` / `fix` / `create`), not the target shape.
- **Don't fork the runner.** If the runner branches on something
  element-specific in more than two places, that branching belongs in
  `claudemdTarget` (or its sibling) — not in the runner module.
- **Don't write strings directly in components.** Add them to
  `runDisplayContext` so a future element doesn't fall through with
  "Apply & deploy" by mistake.
- **Don't skip the archive step.** A run whose report only lives in the
  workdir is lost the moment the user clicks Finish.
