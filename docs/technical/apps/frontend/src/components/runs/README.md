# runs/

**Path:** `apps/frontend/src/components/runs/`

Shared component library for every agent-run kind (audit / fix / create / eval / future `analyze-convo`). Eliminates the duplicated header / status pill / activity feed / chat input that used to live in each run view, and gives any new run kind a one-import path to the same UX.

The library is consumed by `AuditView`, `FixView` and `EvalRunsView`. Run-level i18n (status labels, input copy, thinking verbs) lives in the shared [`runs` namespace](../../i18n/index.md).

## Files

- [AgentActivityFeed.tsx](./AgentActivityFeed.md) — Chat-style activity feed shared by every run kind; renders persisted turns + the streaming bubble + the thinking indicator.
- [HumanInteractionPanel.tsx](./HumanInteractionPanel.md) — Permanent input bar (textarea + Send) for the human-in-the-loop interaction with any agent run.
- [NewRunHeader.tsx](./NewRunHeader.md) — New-design run header (kind pill, status tone, title, stats, action buttons, progress bar) used by `RunScreen`'s audit-like and IDE-style bodies.
- [RunControlHeader.tsx](./RunControlHeader.md) — Top header with Back + icon + title + status badge + tokens / elapsed + kind-specific action / extras / badgeExtras slots.
- [RunErrorBanner.tsx](./RunErrorBanner.md) — Inline banner surfacing a terminal error, identical across run kinds.
- [RunInterruptedBadge.tsx](./RunInterruptedBadge.md) — Amber "Interrupted by reboot" badge shown next to the status pill on rehydrated `waiting_for_input` runs.
- [RunStatusBadge.tsx](./RunStatusBadge.md) — Pill displaying a run's lifecycle status with the right icon, colour and translated label.
- [RunStatusIcon.tsx](./RunStatusIcon.md) — Icon-only variant for tight spaces (run lists, compact detail headers).
- [resume-prompts.ts](./resume-prompts.md) — Synthetic continuation prompts (English) sent to the agent on Reprendre.
- [index.ts](./index.md) — Barrel re-exporting the library so run views import from one path.
