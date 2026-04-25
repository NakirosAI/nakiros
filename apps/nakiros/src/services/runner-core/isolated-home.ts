import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { sandboxRoot } from './git-worktree.js';

/**
 * An isolated HOME directory for a single eval run.
 *
 * Why we isolate HOME at all:
 *  - Claude CLI reads `~/.claude/CLAUDE.md`, `~/.claude/skills/`, and
 *    `~/.claude/projects/<hash>/memory/MEMORY.md` — all inject user-level
 *    context into a run that we want isolated from.
 *  - For fix→eval flows specifically: if the skill under test is also
 *    installed globally (e.g. `~/.claude/skills/<skillName>/`), Claude would
 *    invoke the global copy instead of the version we just placed in the
 *    sandbox. The fix would appear to have no effect on evals.
 *
 * Why we keep almost everything else in ~/.claude/:
 *  - Auth credentials, session tokens, settings, caches, plugins, and MCP
 *    configs all live under `~/.claude/` (or in `~/.claude.json`). Stripping
 *    those out breaks `claude` with "Not logged in" or missing MCPs.
 *
 * Strategy:
 *  - Copy `~/.claude.json` verbatim (MCP registrations).
 *  - Re-create `~/.claude/` in the isolated home by **symlinking** every
 *    entry from the real `~/.claude/`, EXCEPT the ones that leak context.
 *    Symlinks keep auth/settings live (any refresh in the real HOME is
 *    picked up) without touching the excluded items.
 */

/**
 * Entries under `~/.claude/` that would leak user-level context into a run
 * and must NOT be mirrored into the isolated HOME.
 *  - `CLAUDE.md` / `CLAUDE.local.md`: user-level system prompt
 *  - `RTK.md`: personal tooling doc loaded as context
 *  - `skills/`: globally-installed skills that can shadow the sandboxed copy
 *  - `projects/`: per-cwd auto-memory (`MEMORY.md` files)
 */
const LEAKY_CLAUDE_ENTRIES = new Set([
  'CLAUDE.md',
  'CLAUDE.local.md',
  'RTK.md',
  'skills',
  'projects',
]);

/** Handle returned by {@link createIsolatedHome} — points at the isolated HOME directory. */
export interface IsolatedHome {
  path: string;
}

/**
 * Build an isolated HOME directory for a run. Copies `~/.claude.json`
 * verbatim and symlinks every `~/.claude/` entry into the isolated HOME
 * EXCEPT those that would leak user-level context (`CLAUDE.md`,
 * `CLAUDE.local.md`, `RTK.md`, `skills/`, `projects/`). The resulting path is
 * passed to the child process as `HOME=...` so auth / settings / plugins keep
 * working while global skills and user prompts stay out.
 */
export function createIsolatedHome(runId: string): IsolatedHome {
  const homePath = join(sandboxRoot(), `eval-${runId}-home`);
  if (existsSync(homePath)) {
    rmSync(homePath, { recursive: true, force: true });
  }
  mkdirSync(homePath, { recursive: true });

  // 1. Copy ~/.claude.json (MCP registrations, provider settings) verbatim if present.
  try {
    const src = join(homedir(), '.claude.json');
    if (existsSync(src)) {
      copyFileSync(src, join(homePath, '.claude.json'));
    }
  } catch {
    // ignore — an eval without MCPs still produces useful signal
  }

  // 2. Mirror ~/.claude/ into the isolated HOME via symlinks, minus leaky entries.
  //    This preserves auth / settings / sessions / plugins / caches without
  //    copying gigabytes, and without exposing CLAUDE.md or global skills.
  const realClaudeDir = join(homedir(), '.claude');
  if (existsSync(realClaudeDir)) {
    const isolatedClaudeDir = join(homePath, '.claude');
    mkdirSync(isolatedClaudeDir, { recursive: true });
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(realClaudeDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (LEAKY_CLAUDE_ENTRIES.has(entry.name)) continue;
      const source = join(realClaudeDir, entry.name);
      const target = join(isolatedClaudeDir, entry.name);
      try {
        symlinkSync(source, target);
      } catch {
        // best-effort: a failed symlink for one entry shouldn't break the run
      }
    }
  }

  return { path: homePath };
}

/** Tear down an isolated HOME created by {@link createIsolatedHome}. Best-effort. */
export function destroyIsolatedHome(homePath: string): void {
  try {
    rmSync(homePath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
