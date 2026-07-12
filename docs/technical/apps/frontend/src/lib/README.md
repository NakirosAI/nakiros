# lib/

**Path:** `apps/frontend/src/lib/`

Browser-side daemon client and Tailwind classname helper.

## Files

- [agent-run-store.ts](./agent-run-store.md) — Module-scoped store of every active `AgentRun` regardless of kind. Adapters call `syncKind`; React reads via `useAgentRun` / `useActiveAgentRuns`.
- [nakiros-client.ts](./nakiros-client.md) — Browser-side Nakiros client. Side-effect import that builds the `window.nakiros` proxy talking to the daemon.
- [run-api.ts](./run-api.md) — Cross-kind dispatcher mapping an `AgentRunKind` onto its concrete `window.nakiros.*` IPC methods (state + user actions).
- [run-display.ts](./run-display.md) — Centralised display strings (title/label/target-noun) for an agent run, shared by every run-rendering surface.
- [utils.ts](./utils.md) — Tailwind-aware classname helper combining `clsx` and `tailwind-merge`.

Other files under this folder (`run-launcher.ts`, `eval-batch-key.ts`, `overview-buckets.ts`, `skill-identity.ts`, `line-diff.ts`, `feature-flags.ts`, …) predate this index refresh and aren't documented yet — see the frontend agent's memory note on doc-mirror debt.
