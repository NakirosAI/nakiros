# index.ts

**Path:** `apps/frontend/src/components/runs/index.ts`

Barrel re-exporting the shared run-component library consumed by `AuditView`, `FixView`, `EvalRunsView` and any future agent-run kind. Importing from this barrel keeps run views agnostic of the individual file layout.

## Re-exports

- `RunStatusBadge`, `RunBadgeStatus` — see [RunStatusBadge.md](./RunStatusBadge.md)
- `RunStatusIcon` — see [RunStatusIcon.md](./RunStatusIcon.md)
- `RunErrorBanner` — see [RunErrorBanner.md](./RunErrorBanner.md)
- `RunInterruptedBadge` — see [RunInterruptedBadge.md](./RunInterruptedBadge.md)
- `HumanInteractionPanel` — see [HumanInteractionPanel.md](./HumanInteractionPanel.md)
- `AgentActivityFeed` — see [AgentActivityFeed.md](./AgentActivityFeed.md)
- `RunControlHeader` — see [RunControlHeader.md](./RunControlHeader.md)
- `RESUME_PROMPTS`, `ResumePromptKind` — see [resume-prompts.md](./resume-prompts.md)
