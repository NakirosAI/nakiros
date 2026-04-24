# runner-core/

**Path:** `apps/nakiros/src/services/runner-core/`

Domain-agnostic runner primitives composed by every run kind (eval / audit / fix / create / comparison). Handles spawning a `claude` turn, parsing the stream, sandboxing the workdir (git worktree or tmp copy), isolating HOME, persisting run state, and the bounded event log used to replay mid-turn streams after a remount.

The tmp_skill pattern (eval/fix/create isolated from the real skill) is load-bearing for the whole project — the sandbox helpers in `git-worktree.ts` and `tmp-sandbox.ts` are where that pattern is enforced.

## Files

- [index.ts](./index.md) — Barrel re-exporting every helper/type consumed by domain runners.

### Identity + state
- [run-id.ts](./run-id.md) — In-process unique id generator.
- [run-status.ts](./run-status.md) — `isActiveRunStatus` predicate shared by audit + eval lifecycles.
- [run-store.ts](./run-store.md) — Persistent `run.json` snapshot for crash recovery.

### Claude CLI driver
- [claude-stream.ts](./claude-stream.md) — Build argv, spawn one turn, parse the stream-json output into handler callbacks.
- [tool-format.ts](./tool-format.md) — Shared tool-invocation label formatter.
- [execution-settings.ts](./execution-settings.md) — Writes `.claude/settings.local.json` (allow/deny list, auto-accept edits).
- [event-log.ts](./event-log.md) — Broadcast + in-memory ring + persistent `events.jsonl` with restore on boot.

### Sandboxing
- [git-worktree.ts](./git-worktree.md) — Detached-HEAD worktree for skills inside a git repo. Captures `diff.patch` at end-of-run. Neutralises remotes.
- [tmp-sandbox.ts](./tmp-sandbox.md) — Fallback tmp-dir sandbox for skills not inside a git repo.
- [isolated-home.ts](./isolated-home.md) — Symlink-based HOME that hides user-level context while preserving auth/settings.

### Cleanup
- [claude-projects.ts](./claude-projects.md) — Reclaim `~/.claude/projects/*` entries orphaned by Nakiros runs (boot sweep + per-run teardown).
