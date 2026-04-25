# onboarding-installer.ts

**Path:** `apps/nakiros/src/services/onboarding-installer.ts`

Powers the `onboarding:*` IPC channels. Detects editor presence on disk, checks whether the Nakiros global config already exists, and runs the initial install (creates `~/.nakiros/` layout, seeds `config.yaml` and `version.json`). Broadcasts step-by-step progress on `onboarding:progress`.

## Exports

### `type EditorId`

Identifier for an editor/agent environment the onboarding can install into.

```ts
export type EditorId = 'claude' | 'cursor' | 'codex';
```

### `interface DetectedEditor`

Result of `detectEditors`: presence + label + target commands dir for one editor.

```ts
export interface DetectedEditor {
  id: EditorId;
  label: string;
  detected: boolean;
  targetDir: string;
}
```

### `function detectEditors`

Scan well-known install paths for Claude Code / Cursor / Codex and report presence.

```ts
export function detectEditors(): DetectedEditor[]
```

### `function nakirosConfigExists`

True when `~/.nakiros/config.yaml` exists — used by the UI to skip onboarding.

```ts
export function nakirosConfigExists(): boolean
```

### `function installNakiros`

One-shot installer: create `~/.nakiros/` layout, seed `config.yaml` and `version.json` if missing, mark each detected editor as ready.

```ts
export async function installNakiros(editors: DetectedEditor[]): Promise<{ success: boolean; errors: string[] }>
```

**Broadcasts:** `onboarding:progress` for every step (creating directories, writing configs, detecting editors). Errors are collected and returned rather than thrown — the caller displays them next to the failing step.
