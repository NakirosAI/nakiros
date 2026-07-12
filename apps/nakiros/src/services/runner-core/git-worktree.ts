import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

/**
 * Git-worktree based sandbox for skill evaluations.
 *
 * Why: some skills modify code ("dev this feature"). Running them directly
 * against the user's project is destructive. `git worktree add --detach HEAD`
 * gives us a cheap, COW-like checkout (worktree shares `.git/` with the main
 * repo via hard-links) where the agent can write freely. At the end we
 * capture `git diff HEAD` as the artefact of "what this skill would have done"
 * and throw the worktree away.
 *
 * Worktrees live at `~/.nakiros/sandboxes/{label}/` so cleanup is centralised
 * (boot sweep can scan a single directory).
 */

const SANDBOX_ROOT = join(homedir(), '.nakiros', 'sandboxes');

/**
 * Walk up from `start` until a directory contains a `.git` entry (directory
 * OR file — `.git` as a file means we're inside a submodule or worktree, both
 * still work with `git worktree add`). Returns the containing directory or
 * `null` when we hit `/` without finding one.
 */
export function findGitRoot(start: string): string | null {
  let dir = start;
  while (true) {
    const gitPath = join(dir, '.git');
    if (existsSync(gitPath)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Return value of {@link createEvalSandbox}. */
export interface CreateSandboxResult {
  /** Absolute path of the newly created worktree. */
  path: string;
  /** The git root used as the source. */
  gitRoot: string;
}

/**
 * Create a detached worktree of `gitRoot` at HEAD. The label is used as the
 * sandbox directory name under `~/.nakiros/sandboxes/`. Throws if git is
 * unavailable or the worktree add fails.
 *
 * Remotes are removed from the worktree immediately after creation. Worktrees
 * share their `.git/` with the main repo via hardlinks, so a `git push` from
 * inside would otherwise push to the user's real origin. Removing the remotes
 * makes any push a no-op (fail fast) while still letting the skill inspect
 * history, commit locally, or diff against HEAD.
 */
export function createEvalSandbox(gitRoot: string, label: string): CreateSandboxResult {
  mkdirSync(SANDBOX_ROOT, { recursive: true });
  const sandboxPath = join(SANDBOX_ROOT, label);

  // If a previous run left a directory with this name, nuke it first. Git
  // will refuse to reuse an occupied path even with --force-worktree.
  if (existsSync(sandboxPath)) {
    forceRemoveSandbox(sandboxPath);
  }

  // `--detach` avoids creating a branch; `-f` allows parallel worktrees even
  // if something weird happened. `HEAD` is explicit about what we check out.
  execFileSync(
    'git',
    ['-C', gitRoot, 'worktree', 'add', '--detach', '-f', sandboxPath, 'HEAD'],
    { stdio: 'pipe' },
  );

  detachRemotes(sandboxPath);

  return { path: sandboxPath, gitRoot };
}

/**
 * Remove every git remote from a sandbox worktree. Because worktrees share
 * `.git/` with the main repo via hardlinks, the remote config is actually the
 * main repo's config — `git remote remove` here modifies the user's original
 * repo. To avoid that, we override the remote URLs inside the worktree only,
 * pointing them at a black-hole local path. `git push` then fails immediately
 * without reaching any real server.
 *
 * We can't use `git remote remove` because the removal would propagate to the
 * user's real project. Overriding with a per-worktree config insertion would
 * also hit the shared config. The safe approach is to set an invalid URL via
 * `git config --local` on the worktree — but `--local` in a worktree points to
 * `.git/worktrees/<name>/config.worktree`, which is per-worktree and doesn't
 * bleed back. We toggle `extensions.worktreeConfig=true` first to enable that.
 */
function detachRemotes(sandboxPath: string): void {
  try {
    // Enable per-worktree config so subsequent sets only affect this sandbox.
    execFileSync('git', ['-C', sandboxPath, 'config', 'extensions.worktreeConfig', 'true'], {
      stdio: 'pipe',
    });
    const remotesOut = execFileSync('git', ['-C', sandboxPath, 'remote'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString('utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const remote of remotesOut) {
      // Override the URL to a non-existent local path — any push/fetch fails
      // instantly instead of reaching the user's real origin.
      execFileSync(
        'git',
        [
          '-C',
          sandboxPath,
          'config',
          '--worktree',
          `remote.${remote}.url`,
          '/dev/null/nakiros-sandbox-detached',
        ],
        { stdio: 'pipe' },
      );
      execFileSync(
        'git',
        [
          '-C',
          sandboxPath,
          'config',
          '--worktree',
          `remote.${remote}.pushurl`,
          '/dev/null/nakiros-sandbox-detached',
        ],
        { stdio: 'pipe' },
      );
    }
  } catch (err) {
    // Best-effort — if we can't neutralise remotes, we log and move on rather
    // than block the run. The user will still see test output; they just have
    // to be aware their skill could push. We warn loudly.
    console.warn(
      `[git-worktree] Failed to neutralise remotes in ${sandboxPath}. ` +
        `A skill that runs \`git push\` may reach your real remote. Error: ${(err as Error).message}`,
    );
  }
}

/**
 * Capture `git diff HEAD` inside the sandbox — everything the agent wrote that
 * differs from the checked-out tree. Includes new files (as `+` additions) and
 * modifications. Returns an empty string if the worktree is clean.
 */
export function captureSandboxDiff(sandboxPath: string): string {
  try {
    // --no-color for deterministic patches; -- to terminate options before paths
    const out = execFileSync(
      'git',
      ['-C', sandboxPath, 'diff', '--no-color', 'HEAD'],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 },
    );
    return out.toString('utf8');
  } catch {
    // Diff failed (e.g. worktree already removed) — surface as empty.
    return '';
  }
}

/**
 * Additionally capture the LIST of untracked files, since `git diff` by default
 * ignores them unless they've been `git add`ed. Returns an array of repo-relative
 * paths. Useful to prove the agent created new files even if the diff looks empty.
 */
export function listSandboxUntracked(sandboxPath: string): string[] {
  try {
    const out = execFileSync(
      'git',
      ['-C', sandboxPath, 'ls-files', '--others', '--exclude-standard'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out
      .toString('utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Remove a worktree cleanly via `git -C <gitRoot> worktree remove --force`.
 * When `gitRoot` is provided, git resolves the worktree entry from the main
 * repo and drops the `.git/worktrees/<name>` record — preventing stale
 * "prunable" entries from accumulating in the user's repo.
 *
 * Falls back to a plain `rm -rf` if the git call fails (stale entries will
 * be reclaimed by a subsequent `pruneWorktrees` call or by git itself on next
 * use in the main repo). Never throws — cleanup must not block a run.
 *
 * @param sandboxPath Absolute path of the sandbox directory to remove.
 * @param gitRoot Optional git root of the source repo. When provided, the
 *   `git worktree remove` command is issued relative to this root so the
 *   `.git/worktrees/` entry is properly cleaned up.
 */
export function destroyEvalSandbox(sandboxPath: string, gitRoot?: string): void {
  try {
    const gitArgs = gitRoot
      ? ['-C', gitRoot, 'worktree', 'remove', '--force', sandboxPath]
      : ['worktree', 'remove', '--force', sandboxPath];
    execFileSync('git', gitArgs, { stdio: 'pipe' });
    return;
  } catch {
    // fallthrough to rm-based cleanup
  }
  forceRemoveSandbox(sandboxPath);
}

/**
 * Run `git worktree prune` on a git root to remove stale `.git/worktrees/`
 * entries whose directories no longer exist. Safe to call after the sandbox
 * directories have already been deleted (e.g. at boot sweep). Never throws.
 *
 * @param gitRoot Absolute path of the git repository root.
 */
export function pruneWorktrees(gitRoot: string): void {
  try {
    execFileSync('git', ['-C', gitRoot, 'worktree', 'prune'], { stdio: 'pipe' });
  } catch {
    // Best-effort — if the repo is gone or git is unavailable, silently skip.
  }
}

function forceRemoveSandbox(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Boot-time sweep: delete every directory under `~/.nakiros/sandboxes/` that's
 * left over from a previous daemon session. Worktrees from the previous run
 * are orphan (no in-flight eval references them), so they can all go.
 *
 * We intentionally don't try to preserve anything — a completed eval has
 * already saved its `diff.patch` to the artefact directory; an interrupted
 * one has nothing worth keeping.
 *
 * After deleting sandbox directories, runs `git worktree prune` on every
 * `gitRoot` in the provided set so that stale `.git/worktrees/` entries are
 * removed from the user's repositories. This prevents "prunable" ghost entries
 * from accumulating when sandboxes were deleted without a proper
 * `git worktree remove` (e.g. after a daemon crash).
 *
 * @param keep Sandbox paths that must NOT be deleted (rehydrated eval runs
 *   that still need their worktree for `--resume`).
 * @param gitRoots Git repository roots to prune after the sandbox sweep.
 *   Deduplicated internally — pass the same root multiple times safely.
 */
export function sweepOrphanSandboxes(
  keep?: ReadonlySet<string>,
  gitRoots?: ReadonlySet<string>,
): { deleted: number } {
  if (!existsSync(SANDBOX_ROOT)) return { deleted: 0 };
  let entries: string[];
  try {
    entries = readdirSync(SANDBOX_ROOT);
  } catch {
    return { deleted: 0 };
  }
  let deleted = 0;
  for (const name of entries) {
    const p = join(SANDBOX_ROOT, name);
    try {
      const s = statSync(p);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    // Preserve sandboxes that a rehydrated run still references — without this
    // the user's "Reprendre" on a rebooted eval would `--resume` against a
    // sandbox that's just been deleted, hitting "No conversation found".
    if (keep && keep.has(p)) continue;
    destroyEvalSandbox(p);
    deleted++;
  }
  // Prune stale worktree entries from the source repos. The sandbox directories
  // were already deleted above (or were gone before the sweep), so
  // `git worktree remove` can't reach them — `prune` is the correct tool here.
  if (gitRoots) {
    for (const root of gitRoots) {
      pruneWorktrees(root);
    }
  }
  return { deleted };
}

/**
 * Returns the root directory all eval sandboxes live under. Exposed for
 * diagnostics/logging; runners should use `createEvalSandbox` + the returned
 * path rather than constructing their own path under this root.
 */
export function sandboxRoot(): string {
  return SANDBOX_ROOT;
}

/**
 * Run-kind labels accepted by {@link createRunWorktree}.
 * Matches the prefixes used in run ids so the sandbox label is
 * `<kind>-<runId>` and `sweepOrphanSandboxes` reclaims them automatically
 * (it sweeps the entire `~/.nakiros/sandboxes/` directory at boot).
 */
export type RunWorktreeKind = 'fix' | 'audit' | 'eval' | 'create' | 'edit' | 'bootstrap';

/**
 * Create a detached worktree for a fix / audit / create / edit run.
 *
 * This is the canonical way for non-eval runners to obtain a worktree-backed
 * `cwd` that gives the agent full read access to the project source without
 * touching the user's working tree. The worktree is created under
 * `~/.nakiros/sandboxes/<kind>-<runId>/` and remotes are neutralised.
 *
 * The label format `<kind>-<runId>` is intentionally distinct from eval
 * sandboxes (`eval-<runId>`) so boot-time logs are easier to read.
 * `sweepOrphanSandboxes` does NOT distinguish labels — it sweeps everything
 * under `SANDBOX_ROOT`, so orphan run-worktrees are cleaned up on the next
 * daemon start just like eval sandboxes.
 */
export function createRunWorktree(
  gitRoot: string,
  runId: string,
  kind: RunWorktreeKind,
): CreateSandboxResult {
  const label = `${kind}-${runId}`;
  return createEvalSandbox(gitRoot, label);
}
