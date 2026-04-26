# useSkillsViewState.ts

**Path:** `apps/frontend/src/views/skills/useSkillsViewState.ts`

Owns every piece of state and every handler shared by all scoped skill
views. Each scope plugs in its own `SkillsViewConfig` (key derivation,
IPC delegates, optional create polling); the hook handles the rest.

## Exports

### `SkillDetailTab`

```ts
type SkillDetailTab = 'files' | 'evals' | 'audits';
```

Active tab in the right-hand skill detail pane.

### `useSkillsViewState`

```ts
function useSkillsViewState(config: SkillsViewConfig): SkillsViewState;
```

Side effects:

- Loads the skill list once on mount and on `config.scope` change.
- Polls every 2 s (via `usePolling`) for ongoing eval runs, active audit
  runs, active fix runs, and (optional) pending create drafts in a single
  `Promise.all` round-trip. Maps are keyed via `config.keyOfRun` so views
  can look up state by skill key.
- Consumes pending `agentRunFocus` requests once skills have loaded:
  selects the matching skill, switches the detail tab to match the run's
  kind, and opens the native overlay for `audit` / `fix` / `eval` (so
  clicking a run in the topbar lands on the run, not just on the skill).
  If the focus is for a different scope the request is pushed back so the
  matching view can take it. Subscribes to focus updates while mounted.
- Loads the selected file (binary image → data URL, text → string) and
  tracks dirty state vs. `originalContent`.
- Exposes `handleRunEvals` / `handleStartAudit` / `handleStartFix` that
  call the matching `window.nakiros.start*` IPC and surface failures
  through the supplied `onFailure(message)` callback.

Returns a flat object — see `SkillsViewState` for the full shape.

### `SkillsViewState`

```ts
type SkillsViewState = ReturnType<typeof useSkillsViewState>;
```

Full state + actions surface returned by `useSkillsViewState`.
