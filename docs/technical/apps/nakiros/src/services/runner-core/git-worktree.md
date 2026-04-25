# git-worktree.ts

**Path:** `apps/nakiros/src/services/runner-core/git-worktree.ts`

Git-worktree-based sandbox for skill evaluations. Some skills modify code ("dev this feature"); running them directly against the user's project is destructive. `git worktree add --detach HEAD` gives a cheap, COW-like checkout (sharing `.git/` with the main repo via hard-links) where the agent can write freely. At end-of-run we capture `git diff HEAD` as the artefact and throw the worktree away.

Worktrees live at `~/.nakiros/sandboxes/{label}/` so cleanup stays centralised (boot sweep scans a single directory).

**Remote neutralisation:** worktrees share `.git/` with the main repo — a `git push` from inside would reach the user's real origin. Before returning, `createEvalSandbox` enables `extensions.worktreeConfig=true` and rewrites every remote's `url` / `pushurl` to `/dev/null/nakiros-sandbox-detached` using `--worktree`-scoped config, so pushes fail fast without propagating to the main repo's config. If that fails, we log a loud warning and continue.

## Exports

### `function findGitRoot`

Walk up from `start` until a directory contains a `.git` entry (dir OR file — submodules/worktrees both work). Returns the containing directory or `null` when we hit `/` without finding one.

```ts
export function findGitRoot(start: string): string | null
```

### `interface CreateSandboxResult`

Return value of `createEvalSandbox`.

```ts
export interface CreateSandboxResult {
  path: string;
  gitRoot: string;
}
```

### `function createEvalSandbox`

Create a detached worktree of `gitRoot` at HEAD. The label is used as the sandbox directory name under `~/.nakiros/sandboxes/`. Force-removes any existing directory at the target path. Neutralises remotes inside the worktree.

**Throws:** `Error` — when git is unavailable or `git worktree add` fails.

```ts
export function createEvalSandbox(gitRoot: string, label: string): CreateSandboxResult
```

### `function captureSandboxDiff`

Capture `git diff HEAD` inside the sandbox — everything the agent wrote that differs from the checked-out tree. Returns an empty string if the worktree is clean or if the diff fails (e.g. worktree already removed).

```ts
export function captureSandboxDiff(sandboxPath: string): string
```

### `function listSandboxUntracked`

Return the list of untracked files in the sandbox (`git ls-files --others --exclude-standard`). Complements `captureSandboxDiff` which by default ignores untracked files — useful to prove the agent created new files even when the diff looks empty.

```ts
export function listSandboxUntracked(sandboxPath: string): string[]
```

### `function destroyEvalSandbox`

Remove a worktree cleanly via `git worktree remove --force`. Falls back to a plain `rm -rf` if git fails (stale worktree list entries reclaimed by `git worktree prune` next time the main repo runs a worktree command).

```ts
export function destroyEvalSandbox(sandboxPath: string): void
```

### `function sweepOrphanSandboxes`

Boot-time sweep: delete every directory under `~/.nakiros/sandboxes/` left over from a previous daemon session. Orphans have no in-flight references and their artefacts (`diff.patch`) already live in the run's artefact directory.

```ts
export function sweepOrphanSandboxes(): { deleted: number }
```

### `function sandboxRoot`

Returns the root directory every eval sandbox lives under. Exposed for diagnostics/logging — runners should use `createEvalSandbox` + the returned path rather than constructing their own paths under this root.

```ts
export function sandboxRoot(): string
```
