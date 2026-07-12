# BootstrapScreen.tsx

**Path:** `apps/frontend/src/views/BootstrapScreen.tsx`

Project-level entry point for the Project `.claude` Bootstrap feature
(`docs/redesign/features/project-bootstrap.md`). Reached from the sidebar
("Bootstrap") and from the Overview "Configuration" shortcuts, mirroring
every other singleton entity screen (Hooks, Permissions, MCP).

Structurally this mirrors the canonical Skill-screen pattern (breadcrumb
header, one lifecycle per screen) but does NOT reproduce its tab strip:
bootstrap has no independent Audit/Evals/Fix/Files facets to browse — it's
a single interactive session (analyse → discuss → approve → execute) that
ends by writing into the *other* entity screens. The closest existing
precedent for "pick a past run or start a new one" is `AuditHistoryPicker`;
this screen inlines the same idea as a simple list instead of a dropdown
since there's at most one run worth surfacing per project at a time.

This screen doesn't call `lib/run-api.ts#getRunAPI` itself — it builds its
own `RunStateApi<BootstrapRun, BootstrapRunEvent['event']>` object and
calls the generic `useRunState` hook directly, reusing `RunStream` for the
conversation timeline and `RunErrorBanner` for terminal errors. (A
`'bootstrap'` case does exist in `getRunAPI`, but only so the topbar
`RunDock`'s generic stop button works — see that module's doc.)

**Layout during plan validation.** Before `run.plan` exists (`starting` /
`running` / `waiting_for_input` with no plan yet), the conversation
(`RunStream` + `BootstrapComposer`) renders full-width — nothing to
review yet. Once a plan arrives (`awaiting_approval`, and it stays visible
through `executing` / terminal so the user can still see what was
approved), the body switches to a two-column CSS grid —
`gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 2fr)'` — giving the
chat 1/3 and the `BootstrapPlanPanel` documents 2/3, so the proposals
dominate the screen per the UX decision in
`docs/redesign/features/project-bootstrap.md`. This mirrors the
`minmax()`-ratio CSS-grid pattern already used by the 3-pane
`IdeRunScreen` (chat/code/files) rather than inventing a new layout
mechanism; the `minmax(280px, …)` floor keeps the chat column from
becoming unusably thin on a narrow window. The conversation JSX itself
(`chatBody`) is a single local variable shared between both layout
branches so the two arrangements never drift out of sync.

## Exports

### `BootstrapScreen` (default export)

```ts
export default function BootstrapScreen(props: Props): JSX.Element
```

Renders either the idle state (intro card with a "Start bootstrap" CTA +
a list of previous runs for the project, auto-attaching to any in-flight
run) or, once a run is selected, `BootstrapRunView` → `BootstrapRunBody`
— the live conversation (via `getBootstrapTimeline` + `useRunState`),
the token/elapsed header stats (via `getBootstrapUsage`, per
`.claude/rules/token-accounting.md`), the `BootstrapComposer` (enabled
during `waiting_for_input` / `awaiting_approval`), and — once `run.plan`
is non-null — the `BootstrapPlanPanel` in the two-column split described
above.

The history row's proposal count reads `run.proposalCount ?? run.plan?.
proposals.length ?? 0` — `bootstrap:listAll`/`listActive` payloads carry a
slim `plan: null` + `proposalCount` (the full plan only comes from
`getRun`/`startBootstrap`/events), so this works with both the slim and
full payload shapes.

`toggleDecision`'s next value is computed from `effectiveDecision`
(`components/bootstrap/proposal-decision.ts`), not a blanket `'accepted'`
default — matches how `BootstrapPlanPanel` and `handleApprove`'s payload
builder resolve the same proposal's decision, so all three call sites
agree (see that module's doc for the bug this fixes).

`loadRuns`'s auto-attach-to-active-run behavior is gated by a
`hasAutoSelectedRef` flag to the very first call after mount — an explicit
Back click (`setSelectedRunId(null)` then `loadRuns()`) must not
immediately re-select the still-active run, which is what a plain
`current === null` check in the updater would otherwise do on every
refresh.

**Props** (`Props`, not exported — local to this file):
- `project` — the `Project` whose `.claude/` is being bootstrapped.
