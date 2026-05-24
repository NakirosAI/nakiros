# drift-hook.ts

**Path:** `packages/shared/src/types/drift-hook.ts`

Shared types for the Nakiros drift hook installer. Consumed by daemon handlers, `hook-installer.ts`, `nakiros-client.ts`, and `global.d.ts`.

## Exports

### `DriftHookStatus`

```ts
export interface DriftHookStatus {
  installed: boolean;
  stopHookPresent: boolean;
  userPromptSubmitHookPresent: boolean;
  scriptsMaterialized: boolean;
  settingsPath: string;
  scriptPaths: { stop: string; userPromptSubmit: string };
}
```

Full installation state returned by `getDriftHookStatus()`, `installDriftHook()`, and `uninstallDriftHook()`. `installed` is `true` only when all three conditions hold: both hook entries in `settings.json` AND both CJS scripts on disk.

---

### `DriftHookDiff`

```ts
export interface DriftHookDiff {
  settingsPath: string;
  exists: boolean;
  current: string;
  next: string;
  scriptPaths: { stop: string; userPromptSubmit: string };
}
```

Diff payload for the UI confirmation dialog. `current` is the raw `~/.claude/settings.json` content (empty string when the file doesn't exist); `next` is the JSON that `installDriftHook()` will write. The UI renders them side-by-side so the user can audit the mutation before consenting.
