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
 * uses inside `~/.claude/projects/`. Empirically: `/` and `.` both collapse to
 * `-` (so `/Users/foo/.nakiros` → `-Users-foo--nakiros`).
 */
export function encodeProjectPath(cwd: string): string {
  return cwd.replace(/[/.]/g, '-');
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
 * Decoded project path guess: `~/.claude/projects/-Users-x--nakiros-runs-…`
 * back to `/Users/x/.nakiros/runs/…`. The `/` ↔ `.` collision makes perfect
 * reversal impossible, so this is a best-effort reconstruction. Caller gates
 * on the returned path actually existing on disk (which proves the guess).
 */
function decodeProjectPathGuess(encoded: string): string | null {
  let guess = encoded.replace(/-/g, '/');
  if (!guess.startsWith('/')) guess = '/' + guess;
  if (existsSync(guess)) return guess;
  // Try interpreting double-slashes as `.` (hidden directories).
  const dotted = guess.replace(/\/\//g, '/.');
  if (existsSync(dotted)) return dotted;
  return null;
}

export interface SweepResult {
  scanned: number;
  deleted: number;
}

/**
 * Boot-time cleanup. Deletes entries that:
 *   1. decode to a path that no longer exists on disk (orphan), AND
 *   2. carry a Nakiros-identifying marker in their encoded name.
 *
 * Live projects (path still on disk) are left alone. Any entry outside our
 * naming conventions is ignored — we never touch real user projects.
 */
export function sweepOrphanNakirosProjectEntries(): SweepResult {
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
      name.includes('-evals-workspace-iteration-') ||
      // Legacy roots from earlier versions that used `mkdtempSync` under the
      // system tmpdir (`/tmp` → `/private/tmp` on macOS) with `nakiros-audit-*`
      // / `nakiros-fix-*` prefixes.
      name.includes('-nakiros-audit-') ||
      name.includes('-nakiros-fix-');
    if (!hasNakirosMarker) continue;

    // Keep if the backing path still exists (run still in flight, or user
    // hasn't Terminer'd yet). Only orphans get reclaimed here.
    if (decodeProjectPathGuess(name) !== null) continue;

    try {
      rmSync(join(CLAUDE_PROJECTS_DIR, name), { recursive: true, force: true });
      deleted++;
    } catch {
      // ignore
    }
  }

  return { scanned: entries.length, deleted };
}
