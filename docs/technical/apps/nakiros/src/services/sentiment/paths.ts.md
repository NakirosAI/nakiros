# paths.ts

**Path:** `apps/nakiros/src/services/sentiment/paths.ts`

Filesystem layout for the sentiment pre-pass service. Centralises the three paths the service needs: the shared HuggingFace model cache (`~/.nakiros/models/`), the per-project sentiment output directory, and the per-session trace file. All functions create their target directory on demand.

## Exports

### `MODELS_SUBDIR`

```ts
export const MODELS_SUBDIR = 'models'
```

Subdirectory name under `~/.nakiros/` where HuggingFace model weights are cached.

### `SENTIMENT_SUBDIR`

```ts
export const SENTIMENT_SUBDIR = 'sentiment'
```

Subdirectory name under each project's ingest folder where sentiment trace JSON files are stored.

### `getModelsDir`

```ts
export function getModelsDir(): string
```

Returns (and creates) the directory where HuggingFace model weights are cached locally: `~/.nakiros/models/`. Passed to `env.cacheDir` so that the `@xenova/transformers` runtime writes model files here instead of the default XDG cache, keeping all Nakiros state under one root.

**Returns:** Absolute path to `~/.nakiros/models/`, guaranteed to exist.

### `getProjectSentimentDir`

```ts
export function getProjectSentimentDir(projectPath: string): string
```

Returns (and creates) the per-project sentiment output directory: `~/.nakiros/ingest/projects/<encoded>/sentiment/`. One JSON file per session is written here by the store module.

**Returns:** Absolute path to the project's sentiment folder, guaranteed to exist.

### `getSentimentTracePath`

```ts
export function getSentimentTracePath(projectPath: string, sessionId: string): string
```

Absolute path of the sentiment trace file for a given session: `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`.

**Returns:** Absolute path string (file may not exist yet).
