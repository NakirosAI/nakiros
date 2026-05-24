# hook-paths.ts

**Path:** `apps/nakiros/src/services/drift/hook-paths.ts`

Centralised path resolver for the drift hook pipeline. All drift CJS scripts land under `~/.nakiros/drift/`. The canonical command strings written into `~/.claude/settings.json` use `os.homedir()` so they are always absolute.

## Exports

### `getDriftHookDir`

```ts
export function getDriftHookDir(): string
```

Returns `~/.nakiros/drift/` (does not auto-create the directory).

---

### `getDriftStopHookScriptPath`

```ts
export function getDriftStopHookScriptPath(): string
```

Returns `~/.nakiros/drift/hook-stop.cjs`.

---

### `getDriftUserPromptSubmitHookScriptPath`

```ts
export function getDriftUserPromptSubmitHookScriptPath(): string
```

Returns `~/.nakiros/drift/hook-userpromptsubmit.cjs`.

---

### `getDriftStopHookCommandString`

```ts
export function getDriftStopHookCommandString(): string
```

Returns the exact string written into `hooks.Stop[].hooks[].command` in `~/.claude/settings.json`, e.g. `node "/Users/x/.nakiros/drift/hook-stop.cjs"`. The installer matches on this string for idempotent installs and clean uninstalls.

---

### `getDriftUserPromptSubmitHookCommandString`

```ts
export function getDriftUserPromptSubmitHookCommandString(): string
```

Same as above for the `UserPromptSubmit` event: `node "/Users/x/.nakiros/drift/hook-userpromptsubmit.cjs"`.

---

### `getClaudeGlobalSettingsPath`

```ts
export function getClaudeGlobalSettingsPath(): string
```

Returns `~/.claude/settings.json` — the user-global Claude Code settings file both drift hooks are registered in. Mirrors `conversation-ingest/paths.ts#getClaudeGlobalSettingsPath`; both target the same file.
