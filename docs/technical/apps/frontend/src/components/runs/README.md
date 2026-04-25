# runs/

**Path:** `apps/frontend/src/components/runs/`

Shared component library for every agent-run kind (audit / fix / create / eval / future `analyze-convo`). Eliminates the duplicated header / status pill / activity feed / chat input that used to live in each run view, and gives any new run kind a one-import path to the same UX.

The library is consumed by `AuditView`, `FixView` and `EvalRunsView`. Run-level i18n (status labels, input copy, thinking verbs) lives in the shared [`runs` namespace](../../i18n/index.md).

## Files

- [AgentActivityFeed.tsx](./AgentActivityFeed.md) — Chat-style activity feed shared by every run kind; renders persisted turns + the streaming bubble + the thinking indicator.
- [HumanInteractionPanel.tsx](./HumanInteractionPanel.md) — Permanent input bar (textarea + Send) for the human-in-the-loop interaction with any agent run.
- [RunControlHeader.tsx](./RunControlHeader.md) — Top header with Back + icon + title + status badge + tokens / elapsed + kind-specific action / extras slots.
- [RunErrorBanner.tsx](./RunErrorBanner.md) — Inline banner surfacing a terminal error, identical across run kinds.
- [RunStatusBadge.tsx](./RunStatusBadge.md) — Pill displaying a run's lifecycle status with the right icon, colour and translated label.
- [RunStatusIcon.tsx](./RunStatusIcon.md) — Icon-only variant for tight spaces (run lists, compact detail headers).
- [index.ts](./index.md) — Barrel re-exporting the library so run views import from one path.
