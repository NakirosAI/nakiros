# hooks/

**Path:** `apps/frontend/src/hooks/`

Custom React hooks and context providers shared across the frontend. Includes daemon-IPC adapters (`useIpcListener`, `useRunState`, `useVersionInfo`), preference/project context, and small UI utilities.

## Files

- [useAgentRun.ts](./useAgentRun.md) — Subscribe to one agent run by id, or the full active set, from `agentRunStore`.
- [useAgentRunNavigation.tsx](./useAgentRunNavigation.md) — React context exposing the App-level "open this run's native screen" implementation.
- [useAgentRunsSync.ts](./useAgentRunsSync.md) — Mounts the daemon-poll → agent-run-store mirror; called once at the app shell.
- [useConversationAnalyses.ts](./useConversationAnalyses.md) — Fetches per-project conversation analyses; `null` while loading.
- [useDebounce.ts](./useDebounce.md) — Trivial debounce primitive used by search inputs and other rate-limited filters.
- [useElapsedTimer.ts](./useElapsedTimer.md) — Live counter anchored on a real start time, used by run views.
- [useEvalFeedback.ts](./useEvalFeedback.md) — Loads + persists the per-eval feedback map for one iteration.
- [useForm.ts](./useForm.md) — Lightweight controlled-form helper with optional sync validator.
- [useIpcListener.ts](./useIpcListener.md) — Adapter from a daemon IPC `subscribe(handler) → unsubscribe` channel into a React effect.
- [usePolling.ts](./usePolling.md) — Run a callback on a `setInterval` while the component is mounted, with optional `enabled` and `immediate` flags.
- [usePreferences.tsx](./usePreferences.md) — React context exposing the current `AppPreferences` and an async update mutator.
- [useProject.tsx](./useProject.md) — React context for the active project, open project tabs, and tab switch helpers.
- [useRunState.ts](./useRunState.md) — Unified run-stream state for audit / fix / create / eval views.
- [useSkillActionErrorHandlers.ts](./useSkillActionErrorHandlers.md) — Centralizes the `alert()` failure messages shown after eval/audit/fix actions.
- [useVersionInfo.ts](./useVersionInfo.md) — Subscribes a component to the daemon's npm version-check result.
