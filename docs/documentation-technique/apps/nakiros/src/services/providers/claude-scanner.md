# claude-scanner.ts

**Path:** `apps/nakiros/src/services/providers/claude-scanner.ts`

Provider scanner for Claude Code. Walks `~/.claude/projects/<encoded-cwd>/`, decodes each entry back to a filesystem path, filters out stale / missing / eval-artifact paths, and returns `DetectedProject` records. Used by `project-scanner.ts` during the unified `project:scan` walk.

**Heuristics:**
- Prefers the `cwd` field from the most recent JSONL turn when available; falls back to decoding the folder name (`-Users-foo-bar` → `/Users/foo/bar`).
- Skips projects whose decoded path no longer exists on disk.
- Skips eval-iteration artifact paths (`.../evals/workspace/iteration-N/eval-<X>/with_skill`).
- Skips entries with no sessions AND no skills (fully empty).
- Tags projects as `inactive` when their last activity timestamp is older than 30 days.

## Exports

### `function scanClaudeProjects`

Scan `~/.claude/projects/` and return one `DetectedProject` per valid entry. Sorted by `lastActivityAt` descending; entries without a timestamp go to the end.

```ts
export function scanClaudeProjects(
  onProgress?: (current: number, total: number, name: string | null) => void,
): DetectedProject[]
```
