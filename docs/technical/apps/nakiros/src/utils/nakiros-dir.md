# nakiros-dir.ts

**Path:** `apps/nakiros/src/utils/nakiros-dir.ts`

Tiny helper pair for resolving paths under `~/.nakiros/`. Every persisted Nakiros state lives there: `preferences.json`, `projects.json`, `config.yaml`, `version.json`, `commands/`, `commands-meta.json`, `skills/` (live copies), `analyses/`, `runs/` (audit workdirs), `tmp-skills/` (fix + create workdirs), `sandboxes/` (eval worktrees + isolated HOMEs).

## Exports

### `function getNakirosDir`

Resolve `~/.nakiros/` and ensure it exists.

```ts
export function getNakirosDir(): string
```

### `function nakirosFile`

Build an absolute path inside `~/.nakiros/` from path segments. Ensures the parent `.nakiros/` directory exists but does NOT create any intermediate subdirectories — callers are responsible for creating those when writing.

```ts
export function nakirosFile(...parts: string[]): string
```
