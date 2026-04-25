# hooks/

**Path:** `apps/frontend/src/hooks/`

Custom React hooks and context providers shared across the frontend. Includes daemon-IPC adapters (`useIpcListener`, `useRunState`, `useVersionInfo`), preference/project context, and small UI utilities.

## Files

- [useDebounce.ts](./useDebounce.md) — Trivial debounce primitive used by search inputs and other rate-limited filters.
- [useElapsedTimer.ts](./useElapsedTimer.md) — Live counter anchored on a real start time, used by run views.
- [useForm.ts](./useForm.md) — Lightweight controlled-form helper with optional sync validator.
- [useIpcListener.ts](./useIpcListener.md) — Adapter from a daemon IPC `subscribe(handler) → unsubscribe` channel into a React effect.
- [usePreferences.tsx](./usePreferences.md) — React context exposing the current `AppPreferences` and an async update mutator.
- [useProject.tsx](./useProject.md) — React context for the active project, open project tabs, and tab switch helpers.
- [useRunState.ts](./useRunState.md) — Unified run-stream state for audit / fix / create / eval views.
- [useSkillActionErrorHandlers.ts](./useSkillActionErrorHandlers.md) — Centralizes the `alert()` failure messages shown after eval/audit/fix actions.
- [useVersionInfo.ts](./useVersionInfo.md) — Subscribes a component to the daemon's npm version-check result.
