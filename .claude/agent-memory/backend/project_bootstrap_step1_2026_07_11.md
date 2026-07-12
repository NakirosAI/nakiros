---
name: project-bootstrap-step1
description: Step 1 (shared types + IPC channels) of the Project .claude Bootstrap feature, done 2026-07-11
metadata:
  type: project
---

Step 1 of `docs/redesign/features/project-bootstrap.md` build order shipped 2026-07-11 on branch `feature/project-claude-bootstrap`.

New file `packages/shared/src/types/project-bootstrap.ts`: `ProjectBootstrapPlan` (projectId/projectPath/generatedAt/summary/usedFrictionDigests/proposals), `BootstrapEntityProposal` (reuses `RecommendationArtifactType` from recommendation.ts for the entity taxonomy instead of redefining it — no other shared "entity kind" enum exists in the repo, confirmed by grep), `BootstrapProposalStatus` = `'pending'|'accepted'|'rejected'|'written'|'failed'` (doubles as pre-execution decision AND post-execution outcome, no separate result type). `BootstrapRun`/`BootstrapRunStatus` mirror `AuditRun`/`AuditRunStatus` (reuses `AuditRunTurn` from project.ts) plus two bootstrap-specific statuses: `awaiting_approval` and `executing`. `bootstrap:*` IPC channels added to `packages/shared/src/ipc-channels.ts` mirroring the `audit:*` family (start/stopRun/getRun/sendUserMessage/finish/event/listActive/listAll/getBufferedEvents/getTimeline/getUsage) plus one bootstrap-specific `approvePlan` channel.

**Gotcha confirmed**: `sendUserMessage`/`stopRun`/`getRun` payloads across the whole codebase (audit/fix/create/edit/classifyConvo/analyzeConvo) are ad-hoc positional args `(runId: string, message: string)`, never a named shared interface — don't invent one for bootstrap either.

**Not done yet** (later steps per build order): `nakiros-project-bootstrap` bundled skill, the runner (`services/bootstrap-runner.ts` + `daemon/handlers/bootstrap.ts` — 4-file IPC rule still needs handlers/index.ts, nakiros-client.ts, global.d.ts), the frontend screen. `AgentRunKind`/`AgentRunTarget` in agent-run.ts were deliberately NOT touched in step 1 — that's runner-wiring scope (step 3), not shared-types scope (step 1).

tsc clean on `@nakiros/shared`, `@nakirosai/nakiros` (note: package name is `@nakirosai/nakiros`, NOT `nakiros` — `pnpm -F nakiros` fails silently with "No projects matched"), and `@nakiros/frontend` after rebuilding shared's dist first (see [[feedback_shared_dist_stale]]).
