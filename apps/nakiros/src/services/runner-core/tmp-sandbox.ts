import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

import { sandboxRoot } from './git-worktree.js';

/**
 * Fallback sandbox for skills that don't live inside a git repo (bundled,
 * globally-installed, or any skill under `~/.nakiros/skills/`).
 *
 * We can't use `git worktree` (no repo to branch from), and we don't want to
 * run the agent in-place inside the real skill directory — Claude would walk
 * up the filesystem, read the real SKILL.md, see past iterations in
 * `evals/workspace/`, and write into the real skill path. Exactly the leaks
 * the worktree mode was designed to prevent.
 *
 * Instead we stand up a throwaway tmp directory under `~/.nakiros/sandboxes/`
 * (same root as worktrees, so cleanup stays centralised) with this shape:
 *
 *   <sandbox>/
 *   └── .claude/
 *       └── skills/
 *           └── <skillName>/        ← copied from real skill, MINUS evals/workspace/
 *
 * The `.claude/skills/` layout is the convention Claude Code uses to discover
 * project-scoped skills, so invoking `/skillName` from inside `<sandbox>/`
 * will load the copy, not the real one.
 *
 * For `without_skill` baselines the copy is skipped entirely — the agent sees
 * an empty sandbox with no skill at all.
 */

export interface CreateTmpSandboxArgs {
  runId: string;
  skillDir: string;
  skillName: string;
  includeSkill: boolean;
}

export interface CreateTmpSandboxResult {
  path: string;
}

export function createTmpSandbox(args: CreateTmpSandboxArgs): CreateTmpSandboxResult {
  const sandboxPath = join(sandboxRoot(), `eval-${args.runId}`);
  if (existsSync(sandboxPath)) {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
  mkdirSync(sandboxPath, { recursive: true });

  if (args.includeSkill) {
    const skillsDir = join(sandboxPath, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    const destSkillDir = join(skillsDir, args.skillName);

    // Copy the skill but filter out `evals/workspace/` — past iterations would
    // otherwise leak filenames, grading verdicts, and prior outputs into the run.
    cpSync(args.skillDir, destSkillDir, {
      recursive: true,
      filter: (src: string): boolean => {
        // Normalise separators so the check works on any OS.
        const rel = src.slice(args.skillDir.length).replace(/\\/g, '/');
        if (rel === '/evals/workspace' || rel.startsWith('/evals/workspace/')) return false;
        return true;
      },
    });
  }

  return { path: sandboxPath };
}

export function destroyTmpSandbox(sandboxPath: string): void {
  try {
    rmSync(sandboxPath, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
