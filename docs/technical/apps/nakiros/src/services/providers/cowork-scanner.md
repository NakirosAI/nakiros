# cowork-scanner.ts

**Path:** `apps/nakiros/src/services/providers/cowork-scanner.ts`

Provider scanner for Cowork (Anthropic's local-agent-mode tool). Walks `~/Library/Application Support/Claude/local-agent-mode-sessions/<spaceId>/<userId>/spaces.json`, maps each space to its matching `local_<uuid>` session groups via `userSelectedFolders`, counts aggregated JSONL sessions, and returns `DetectedProject` records. Used by `project-scanner.ts` during the unified `project:scan` walk.

**Key mapping rules:**
- One space = one Nakiros project; stable id is `cowork:<space.id>`.
- `projectPath` = `space.folders[0].path` (the real user-visible folder, not the internal Cowork sandbox path recorded in JSONL `cwd` fields).
- `providerProjectDir` = `<root>/<spaceId>/<userId>/` — the user directory that holds `spaces.json` and all session group directories.
- Sessions from all `local_<uuid>` groups whose `userSelectedFolders` contains any of the space's folder paths are aggregated under the space.
- Skips spaces with no sessions (session count = 0).
- Tags projects as `inactive` when their last activity is older than 30 days.
- `skillCount` is always `0` — Cowork does not store skills inside `space.folders[0]/.claude/skills/`.

## Exports

### `function scanCoworkProjects`

Scan the Cowork session storage root and return one `DetectedProject` per valid space. Sorted by `lastActivityAt` descending; entries without a timestamp go to the end.

```ts
export function scanCoworkProjects(
  onProgress?: (current: number, total: number, name: string | null) => void,
): DetectedProject[]
```

**Parameters:**
- `onProgress` — optional callback fired per space with `(current, total, spaceName)`.

**Returns:** Array of `DetectedProject` records, one per Cowork space with at least one session. Empty array when `COWORK_ROOT` does not exist.
