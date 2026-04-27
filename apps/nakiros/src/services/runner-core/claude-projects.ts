import { existsSync, readdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Every `claude` subprocess we spawn registers its cwd as a "project" under
 * `~/.claude/projects/<encoded-cwd>/` — the CLI stores conversation history
 * there. Because Nakiros uses a fresh cwd per run (audit workdir, fix/create
 * tmp-skill, eval iteration), each run leaves a stale project entry behind,
 * bloating the user's Claude Code project list.
 *
 * The helpers here delete those entries whenever we tear down the backing
 * workdir, and offer a boot-time sweep that reclaims any stragglers from
 * previous sessions.
 */

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/**
 * Translate an absolute filesystem path into the directory name Claude Code
 * uses inside `~/.claude/projects/`. Empirically: `/`, `.` AND `_` all
 * collapse to `-` (so `/Users/foo/.nakiros/runs/audit/audit_xxx_1` becomes
 * `-Users-foo--nakiros-runs-audit-audit-xxx-1`). Matches the encoding the
 * `claude` CLI itself uses — without the underscore mapping the daemon's
 * resume / cleanup helpers would target the wrong directory and silently
 * leak entries (or fail with "No conversation found with session ID …").
 */
export function encodeProjectPath(cwd: string): string {
  return cwd.replace(/[/._]/g, '-');
}

/**
 * Delete the Claude-Code project entry for a given cwd. No-ops if the entry
 * doesn't exist. Safe to call right before (or after) removing the workdir.
 */
export function deleteClaudeProjectEntry(cwd: string): void {
  const entry = join(CLAUDE_PROJECTS_DIR, encodeProjectPath(cwd));
  try {
    rmSync(entry, { recursive: true, force: true });
  } catch {
    // ignore — best-effort
  }
}

/**
 * Tear down a run's workdir: remove the directory itself and the matching
 * Claude-Code project entry. Both steps are best-effort; missing dirs are
 * fine. Used by audit/fix/create at end-of-run.
 */
export function cleanupRunWorkdir(workdir: string): void {
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    // ignore — best-effort
  }
  deleteClaudeProjectEntry(workdir);
}

/** Return value of {@link sweepOrphanNakirosProjectEntries} — how many entries were scanned vs deleted. */
export interface SweepResult {
  scanned: number;
  deleted: number;
}

/**
 * Boot-time cleanup. Deletes Claude-Code project entries that:
 *   1. carry a Nakiros-identifying marker in their encoded name, AND
 *   2. are NOT in the `keep` set (encoded names that the rehydrate phase
 *      just registered as still-live runs).
 *
 * The `keep` set is built upstream by collecting every registered run's
 * cwd and encoding it with {@link encodeProjectPath}. We don't try to
 * decode the Claude entry name back to a filesystem path — the encoding
 * collapses `/`, `.` and `_` to a single `-`, so the reverse is ambiguous.
 * Going forward only by what the runner registries hold is reliable.
 *
 * Without the `keep` argument the sweep falls back to a permissive mode:
 * entries with a Nakiros marker AND no matching encoding in the registry
 * survive. Caller is responsible for passing the keep set if it wants
 * orphan cleanup; passing an empty `Set<string>()` will reclaim
 * **everything** Nakiros-marked.
 */
export function sweepOrphanNakirosProjectEntries(keep?: ReadonlySet<string>): SweepResult {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return { scanned: 0, deleted: 0 };

  let entries: string[];
  try {
    entries = readdirSync(CLAUDE_PROJECTS_DIR);
  } catch {
    return { scanned: 0, deleted: 0 };
  }

  let deleted = 0;
  for (const name of entries) {
    const hasNakirosMarker =
      // Current workdir roots
      name.includes('-nakiros-runs-') ||
      name.includes('-nakiros-tmp-skills-') ||
      name.includes('-nakiros-sandboxes-') ||
      name.includes('-evals-workspace-iteration-') ||
      // Comparison evals (A/B/C across models) — same shape as iteration
      // workspaces but rooted under `evals/comparisons/<ts>/<model>/eval-*`.
      // Without this marker the boot sweep leaves stale Claude project
      // entries every time the user runs a comparison.
      name.includes('-evals-comparisons-') ||
      // Legacy roots from earlier versions that used `mkdtempSync` under the
      // system tmpdir (`/tmp` → `/private/tmp` on macOS) with `nakiros-audit-*`
      // / `nakiros-fix-*` prefixes.
      name.includes('-nakiros-audit-') ||
      name.includes('-nakiros-fix-');
    if (!hasNakirosMarker) continue;

    // Keep entries the registry still references. Without a keep set we
    // can't know what's live, so we leave Nakiros entries alone — better
    // to leak a few stale entries than nuke a session file the user is
    // about to "Reprendre" against.
    if (!keep) continue;
    if (keep.has(name)) continue;

    try {
      rmSync(join(CLAUDE_PROJECTS_DIR, name), { recursive: true, force: true });
      deleted++;
    } catch {
      // ignore
    }
  }

  return { scanned: entries.length, deleted };
}
