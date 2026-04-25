# isolated-home.ts

**Path:** `apps/nakiros/src/services/runner-core/isolated-home.ts`

Build an isolated HOME directory for a single claude run. This prevents user-level context (`~/.claude/CLAUDE.md`, global skills, auto-memory) from leaking into runs while preserving everything auth/config-wise that `claude` needs to actually work.

**Why isolate HOME:**
- Claude CLI reads `~/.claude/CLAUDE.md`, `~/.claude/skills/`, `~/.claude/projects/<hash>/memory/MEMORY.md` — all inject user-level context into a run we want isolated from.
- For fix→eval flows specifically: if the skill under test is also installed globally (e.g. `~/.claude/skills/<skillName>/`), Claude would invoke the global copy instead of the sandboxed version. The fix would appear to have no effect on evals.

**Why keep almost everything else:**
- Auth credentials, session tokens, settings, caches, plugins, and MCP configs all live under `~/.claude/` or in `~/.claude.json`. Stripping them breaks `claude` with "Not logged in" or missing MCPs.

**Strategy:** copy `~/.claude.json` verbatim, then symlink every entry under `~/.claude/` into the isolated HOME EXCEPT: `CLAUDE.md`, `CLAUDE.local.md`, `RTK.md`, `skills/`, `projects/`.

## Exports

### `interface IsolatedHome`

Handle returned by `createIsolatedHome` — points at the isolated HOME directory.

```ts
export interface IsolatedHome {
  path: string;
}
```

### `function createIsolatedHome`

Build an isolated HOME directory for a run. The resulting path is passed to the child process as `HOME=...` so auth / settings / plugins keep working while global skills and user prompts stay out.

```ts
export function createIsolatedHome(runId: string): IsolatedHome
```

### `function destroyIsolatedHome`

Tear down an isolated HOME created by `createIsolatedHome`. Best-effort.

```ts
export function destroyIsolatedHome(homePath: string): void
```
