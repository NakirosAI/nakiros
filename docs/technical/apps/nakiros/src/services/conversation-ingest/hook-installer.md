# hook-installer

**Path:** `apps/nakiros/src/services/conversation-ingest/hook-installer.ts`

Install / inspect / uninstall the Stop hook entry Nakiros owns inside `~/.claude/settings.json`. Only touches the `hooks.Stop` array entries matching the canonical Nakiros command string — every other entry is round-tripped verbatim so the Permissions and Hooks tabs can coexist safely.

## Exports

### `isHookInstalled`

```ts
export function isHookInstalled(): boolean
```

Returns true if `~/.claude/settings.json` currently has the Nakiros Stop hook installed.

### `previewHookDiff`

```ts
export function previewHookDiff(): ConversationIngestHookDiff
```

Build the diff payload shown to the user before they enable ingestion. The UI renders `current` and `next` side-by-side so the user can audit the settings.json mutation before consenting.

### `installHook`

```ts
export function installHook(): void
```

Install the Stop hook + write the `hook-stop.cjs` script to disk. Idempotent — calling twice leaves exactly one Nakiros entry in `hooks.Stop`.

**Throws:** `Error` on write failure — the caller surfaces a `settings-write-failed` mutation result to the UI

### `uninstallHook`

```ts
export function uninstallHook(): void
```

Remove the Nakiros Stop hook from `settings.json` and delete the on-disk hook script. Idempotent — safe to call when nothing is installed.
