# lib/

**Path:** `apps/frontend/src/lib/`

Browser-side daemon client and Tailwind classname helper.

## Files

- [agent-run-focus.ts](./agent-run-focus.md) — Tiny ad-hoc bus used by the runs center to express "after the next navigation, focus this run".
- [agent-run-store.ts](./agent-run-store.md) — Module-scoped store of every active `AgentRun` regardless of kind. Adapters call `syncKind`; React reads via `useAgentRun` / `useActiveAgentRuns`.
- [nakiros-client.ts](./nakiros-client.md) — Browser-side Nakiros client. Side-effect import that builds the `window.nakiros` proxy talking to the daemon.
- [utils.ts](./utils.md) — Tailwind-aware classname helper combining `clsx` and `tailwind-merge`.
