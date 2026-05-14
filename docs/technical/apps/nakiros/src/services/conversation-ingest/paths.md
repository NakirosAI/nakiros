# paths

**Path:** `apps/nakiros/src/services/conversation-ingest/paths.ts`

Directory and file path helpers for the conversation-ingest pipeline. Centralised so both the daemon-side runner and the disk-resident `hook-stop.cjs` script can agree on the same storage locations without sharing imports.

Layout (V2):
```
~/.nakiros/ingest/
  queue/                         one JSON file per Stop-hook invocation
  hook-stop.cjs                  the hook script
  index.json                     global project index (V2 manifest)
  projects/<encoded>/            one subdir per project
    sessions/<sessionId>.json    parsed session bodies
    digests/<sessionId>.json     friction-classifier outputs
    sentiment/<sessionId>.json   sentiment pre-pass traces
```

## Exports

### Constants

- `INGEST_DIR_NAME` — `'ingest'`
- `INGEST_QUEUE_SUBDIR` — `'queue'`
- `INGEST_PROJECTS_SUBDIR` — `'projects'`
- `INGEST_PROJECT_SESSIONS_SUBDIR` — `'sessions'`
- `INGEST_PROJECT_DIGESTS_SUBDIR` — `'digests'`
- `INGEST_INDEX_FILENAME` — `'index.json'`
- `INGEST_HOOK_SCRIPT_FILENAME` — `'hook-stop.cjs'`
- `INGEST_LEGACY_MANIFEST_FILENAME` — `'manifest.json'` (V1 legacy)
- `INGEST_LEGACY_SESSIONS_SUBDIR` — `'sessions'` (V1 legacy)

### `getIngestDir`

```ts
export function getIngestDir(): string
```

Returns (and creates) `~/.nakiros/ingest/`.

### `getIngestQueueDir`

```ts
export function getIngestQueueDir(): string
```

Returns (and creates) `~/.nakiros/ingest/queue/`.

### `getIngestProjectsDir`

```ts
export function getIngestProjectsDir(): string
```

Returns (and creates) `~/.nakiros/ingest/projects/`.

### `getIngestIndexPath`

```ts
export function getIngestIndexPath(): string
```

Returns the path to `~/.nakiros/ingest/index.json`.

### `getIngestHookScriptPath`

```ts
export function getIngestHookScriptPath(): string
```

Returns the path to `~/.nakiros/ingest/hook-stop.cjs`.

### `getIngestLegacyManifestPath`

```ts
export function getIngestLegacyManifestPath(): string
```

Path to the V1 legacy `manifest.json` — used only by the one-shot migration on boot.

### `getIngestLegacySessionsDir`

```ts
export function getIngestLegacySessionsDir(): string
```

Path to the V1 legacy `sessions/` directory — used only by the one-shot migration on boot.

### `getClaudeGlobalSettingsPath`

```ts
export function getClaudeGlobalSettingsPath(): string
```

Path of the user-global Claude Code settings file we register the Stop hook in. Per-project hooks would only fire inside that project — we want global coverage so every conversation flows through Nakiros.

### `getHookCommandString`

```ts
export function getHookCommandString(): string
```

The shell command Nakiros writes into `~/.claude/settings.json` Stop-hook entries.

### `encodeProjectDirName`

```ts
export function encodeProjectDirName(projectPath: string): string
```

Deterministic, filesystem-safe encoding of a project path. Composed of the basename (sanitised, capped at 32 chars) plus 8 hex chars of a SHA-1 hash over the full original path so two projects with the same basename never collide. The mapping is one-way — we never decode the directory name back.

**Parameters:**
- `projectPath` — absolute path of the project root

**Returns:** encoded directory name, e.g. `timetrackerAgent-a1b2c3d4`

### `getProjectDir`

```ts
export function getProjectDir(projectPath: string): string
```

Absolute path of a single project's subdir under `projects/`. Creates it if missing.

### `getProjectSessionsDir`

```ts
export function getProjectSessionsDir(projectPath: string): string
```

Absolute path of the per-project `sessions/` folder where session bodies live.

### `getProjectDigestsDir`

```ts
export function getProjectDigestsDir(projectPath: string): string
```

Per-project `digests/` folder where the V1.1 friction classifier persists `<sessionId>.json` outputs. Created on demand the first time a digest is generated for the project.

### `getDigestPath`

```ts
export function getDigestPath(projectPath: string, sessionId: string): string
```

Path of a single digest file. Convention: `<sessionId>.json`.

### `classifySessionKind`

```ts
export function classifySessionKind(projectPath: string): ConversationIngestSessionKind
```

Heuristic that flags a session as Nakiros-internal noise (`'synthetic'`) versus real user activity (`'user'`). Synthetic sessions match fix-temp sandboxes, any path under `~/.nakiros/`, or eval iteration workspace paths.

**Parameters:**
- `projectPath` — resolved project path from the JSONL `cwd` field

**Returns:** `'user'` or `'synthetic'`
