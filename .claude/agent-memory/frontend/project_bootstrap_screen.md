---
name: project_bootstrap_screen
description: BootstrapScreen (Project .claude Bootstrap) — bypasses the generic AgentRunKind run system by design; reuses useRunState/RunStream directly
metadata:
  type: project
---

`views/BootstrapScreen.tsx` (+ `components/bootstrap/{BootstrapProposalCard,BootstrapPlanPanel,BootstrapComposer}.tsx`)
implements the Project `.claude` Bootstrap feature
(`docs/redesign/features/project-bootstrap.md`, step 4 of the build order).

**Key architectural decision**: it does NOT plug into the generic multi-kind
run system (`lib/run-api.ts#getRunAPI`, `RunScreen.tsx`, `hooks/useTabs.ts`'s
`RunTab`/`AgentRunKind`, `agent-run-store.ts`). That dispatcher is keyed by
the shared `AgentRunKind` union (`packages/shared/src/types/agent-run.ts`),
which would need a `'bootstrap'` member — a shared-package edit outside
frontend-agent scope, and also a poor fit: `BootstrapRun` has an
approval/plan lifecycle (`awaiting_approval`/`executing` statuses, a
`plan: ProjectBootstrapPlan | null` field) the generic `AuditLikeRun` union
doesn't model.

Instead: added `'bootstrap'` to `ProjectTabView` (frontend-only type in
`useTabs.ts`, unrelated to `AgentRunKind`) as a normal sidebar/overview
entity screen, self-contained — it calls `window.nakiros.startBootstrap`
etc. directly and is never opened as a `kind: 'run'` tab. It DOES reuse:
`useRunState` (generic over `<R extends {status}, Ev>`, so it works with
`BootstrapRun`/`BootstrapRunEvent['event']` without any shared-type change),
`RunStream` (its `timeline` prop accepts `FixTimelineEntry[]`, and
`BootstrapTimelineEntry = ChatTimelineEntry` is a subset union member, so
it's structurally assignable — no cast needed), `RunErrorBanner`,
`useElapsedTimer`, `formatTokens`/`formatComputeDuration` from
`utils/format.ts`, `MarkdownViewer`, `formatAuditTimestamp` from
`lib/run-display.ts`.

Did NOT reuse `NewRunHeader` (typed `kind: AgentRunKind`, would need a
lying cast) nor `HumanInteractionPanel` (hardcodes legacy `--line`/
`--bg-soft` vars per `.claude/rules/ui-kit.md` — wrote `BootstrapComposer`
as the native n-*-styled equivalent instead).

UX divergence from the Skill-screen canonical pattern (explicitly noted,
not silent): no tab strip. Bootstrap is a single linear session
(start → conversation/plan → approve → executing), not a browsable
per-entity Audit/Evals/Fix/Files set — the closest precedent
(`AuditHistoryPicker`) was adapted as a plain history list instead of a
dropdown, since a project has at most one bootstrap run worth surfacing
at a time.

New i18n namespace `bootstrap` (not `bootstrap-runner` — no naming
collision to avoid here, unlike hooks/permissions/mcp/output-styles which
each have a legacy Module counterpart).

**Doc-mirror debt discovered while running `/code-documentation`**: several
frontend files/dirs predate the new-design migration and have never been
synced — `views/README.md` still lists deleted legacy views (`Dashboard.tsx`,
`AuditView.tsx`, `ProjectOverview.tsx`, …) and is missing most current
screens (`SkillDetailScreen`, `RunScreen`, `HooksScreen`, `PermissionsScreen`,
`McpScreen`, `ClaudeMdScreen`, `ProjectOverviewScreen`, `IdeRunScreen`,
`SettingsScreen`, `MarketplaceScreen`, `RulesScreen`, `SubagentsScreen`,
`OutputStylesScreen`, etc.); same for `components/README.md` (missing
`shell/` subfolder, still lists deleted `RunsCenter.tsx`/`Sidebar.tsx`).
`compute-diff.mjs --scope apps/frontend/src` flags ~70 files. Did not
attempt a full rattrapage (out of scope for this task) — only added
accurate entries for the files this task touched. A future `--full` pass
on `apps/frontend` is warranted.
