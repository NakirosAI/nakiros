# run-display.ts

**Path:** `apps/frontend/src/lib/run-display.ts`

Centralised display strings for an agent run. Used by every UI surface
that has to render a run's title / label / sandbox-noun (`RunScreen`
header, `NewRunHeader`, `RunDock`, `AuditCompletedReport`, reject
prompts). Single source of truth so, e.g., a CLAUDE.md run never displays
"Create skill" and a skill run never displays "CLAUDE.md sandbox". Add a
new run target here when introducing one — the surface code stays
untouched.

## Exports

### `formatAuditTimestamp`

```ts
export function formatAuditTimestamp(iso: string): string
```

Formats an ISO timestamp into a compact, locale-aware string suitable for
audit history labels, picker pills, and sidebar timestamps. Extracted here
so `AuditHistoryPicker`, `ClaudeMdScreen`, and `views/BootstrapScreen.tsx`'s
run-history rows share the same format — no duplicates.

### `interface RunDisplayContext`

The shape every surface reads from: `title`, `kindLabel`, `actionVerb`
(now `'Audit' | 'Fix' | 'Create' | 'Edit' | 'Eval' | 'Analyze' | 'Classify' | 'Bootstrap'`),
`targetNoun`, the per-target `isXxx` booleans (claudemd/rules/subagents/
hooks/permissions/mcp/output-styles), and `scopeLabel`.

### `runDisplayContext`

```ts
export function runDisplayContext(kind: AgentRunKind, run: AuditLikeRun): RunDisplayContext
```

Builds the display context for a run — pure, safe to call inline. Narrows
on which `*Target` field is present on `run` (`claudemdTarget`,
`rulesTarget`, …) to pick the right title/label shape, falling back to the
generic skill shape when none match. `ACTION_BY_KIND` (module-local,
`Record<AgentRunKind, RunDisplayContext['actionVerb']>`) includes a
`bootstrap: 'Bootstrap'` entry for exhaustiveness only — a bootstrap run
never actually reaches this function in practice, since
`views/BootstrapScreen.tsx` owns its own header/labels standalone and
`NewShell.handleOpenRun` routes bootstrap `AgentRun`s away from the
generic `RunScreen` tab this function serves.
