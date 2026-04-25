# project-scanner.ts

**Path:** `apps/nakiros/src/services/project-scanner.ts`

Persisted registry of Claude Code projects Nakiros tracks. Combines the provider scanner (`providers/claude-scanner.ts`) with persisted state (`~/.nakiros/projects.json`), handling dismiss lifecycle and purging obsolete eval-iteration paths auto-recorded by Claude.

## Exports

### `function scan`

Scan every provider's project directory, merge with the persisted registry, write the result back, and return the non-dismissed projects. Dismissed projects stay dismissed across scans; obsolete paths (eval iteration artifacts) are purged.

```ts
export function scan(
  onProgress?: (current: number, total: number, name: string | null) => void,
): Project[]
```

### `function listProjects`

Return every non-dismissed project from the persisted registry (no re-scan).

```ts
export function listProjects(): Project[]
```

### `function getProject`

Look up a project by id in the persisted registry. Returns `null` when unknown.

```ts
export function getProject(id: string): Project | null
```

### `function dismissProject`

Mark a project as `dismissed` so it stops appearing in `listProjects` / `scan` results.

```ts
export function dismissProject(id: string): void
```

### `function hasProjects`

True when at least one non-dismissed project exists. Cheap check used by onboarding gates.

```ts
export function hasProjects(): boolean
```
