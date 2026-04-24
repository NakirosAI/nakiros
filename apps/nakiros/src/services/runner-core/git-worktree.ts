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
 * Remove a worktree cleanly via `git worktree remove --force`. The subcommand
 * contacts the main repo to drop the worktree entry and deletes the directory.
 * Falls back to a plain `rm -rf` if the git call fails (stale worktree list
 * entries will be reclaimed by `git worktree prune` on next use in the main
 * repo).
 */
export function destroyEvalSandbox(sandboxPath: string): void {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', sandboxPath], {
      stdio: 'pipe',
    });
    return;
  } catch {
    // fallthrough to rm-based cleanup
  }
  forceRemoveSandbox(sandboxPath);
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
 */
export function sweepOrphanSandboxes(): { deleted: number } {
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
    destroyEvalSandbox(p);
    deleted++;
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
