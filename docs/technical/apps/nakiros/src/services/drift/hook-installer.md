# hook-installer.ts

**Path:** `apps/nakiros/src/services/drift/hook-installer.ts`

Idempotent installer for the two Nakiros drift hooks (`Stop` + `UserPromptSubmit`) inside `~/.claude/settings.json`. Only touches entries matching the canonical drift command strings — all other hooks (e.g. the conversation-ingest Stop hook) are preserved verbatim.

## Exports

### `getDriftHookStatus`

```ts
export function getDriftHookStatus(): DriftHookStatus
```

Inspect current installation state without touching anything. Checks both `~/.claude/settings.json` entries and CJS script presence on disk. Returns a `DriftHookStatus` where `installed === true` only when both hooks are present in settings AND both scripts exist.

---

### `buildDriftHookDiff`

```ts
export function buildDriftHookDiff(): DriftHookDiff
```

Compute the `current` vs `next` diff of `~/.claude/settings.json` that `installDriftHook()` would apply. Pure read — does not write anything. Intended for the UI confirmation dialog before the user enables drift hooks.

---

### `installDriftHook`

```ts
export function installDriftHook(): DriftHookStatus
```

Install both drift hooks. Idempotent — calling twice leaves exactly one Nakiros drift entry per event key. Writing order: CJS scripts first (so Claude Code never fires a hook pointing to a missing file), then `~/.claude/settings.json` via atomic rename.

@throws on write failure (permissions, full disk) — callers should surface the error to the UI.

---

### `uninstallDriftHook`

```ts
export function uninstallDriftHook(): DriftHookStatus
```

Remove both drift hooks from `~/.claude/settings.json` and delete the two CJS scripts. Idempotent — safe to call when nothing is installed. The `UserPromptSubmit` key (and the top-level `hooks` key if empty) are cleaned up automatically. The conversation-ingest Stop hook and all other hooks are preserved.
