---
name: project_runner_worktree_2026_05_25
description: Git worktree support wired into fix/audit/create/edit runners (2026-05-25). Agents now land in project tree instead of empty sandbox.
metadata:
  type: project
---

# Runner worktree support — 2026-05-25

## What was done

Wired git worktree support into fix-runner (covers fix/create/edit/audit modes for all 8 artefact types: skill + 7 `.claude/` entities).

**Why:** agents in fix/create/edit/audit runs were spawned with `cwd = ~/.nakiros/tmp-skills/<runId>/` (empty sandbox). They couldn't read project source files to understand architecture.

## Architecture

Two root directories coexist per run:
- `~/.nakiros/tmp-skills/<runId>/` — Nakiros artefact workdir (outputs/, run.json, draft files, dot-claude-snapshot)
- `~/.nakiros/sandboxes/<kind>-<runId>/` — git worktree of user project, used as Claude subprocess `cwd`

## Key design decisions

### BaseRun.cwd
Added `cwd?: string` to `runner-core/runner.ts BaseRun`. `executeTurn` uses `run.cwd ?? run.workdir` as Claude subprocess cwd. Also added `cwd?: string` to `AuditRun` in shared types (daemon-internal, never sent to frontend).

### createRunWorktree
New function in `runner-core/git-worktree.ts`. Label format: `<kind>-<runId>` (distinct from eval's `eval-<runId>`). `sweepOrphanSandboxes` cleans all of SANDBOX_ROOT at boot — covers these automatically.

### Symlink strategy
- `*Target` runs (expert skills): symlink expert skill dir → `<worktreePath>/.claude/skills/<name>` AND `<workdir>/.claude/skills/<name>` (both, for fallback)
- Skill fix/edit runs: symlink workdir → `<worktreePath>/.claude/skills/<name>` (so agent writes land in Nakiros copy)
- Create runs: same symlink as fix

### Session JSONL lookup
Claude Code indexes session JSONL by subprocess cwd. `getFixTimeline`, `getFixUsage`, `listFixEditsHistory` all use `entry.run.cwd ?? workdir` for `encodeProjectPath`.

### Rehydration
After reboot: `run.cwd` restored from `blob.cwd`. But `extras.worktreePath = null` (worktree was swept). Boot sweep handles cleanup automatically.

### Fallback
If `findGitRoot` returns null (not in a git repo) or `createRunWorktree` throws → `worktreePath = null`, run proceeds with workdir-only cwd (legacy behavior).

## Files modified

- `runner-core/git-worktree.ts` — added `createRunWorktree`, `RunWorktreeKind`
- `runner-core/index.ts` — exports updated
- `runner-core/runner.ts` — `cwd?` on `BaseRun`, used in `executeTurn`
- `services/fix-runner.ts` — `worktreePath` in extras, worktree creation in `prepareWorkdir`, `run.cwd` in `createInitialRun`, worktree cleanup in `cleanupOnTerminal`/`onTurnFailed`, session JSONL lookup uses `run.cwd`
- `packages/shared/src/types/project.ts` — `cwd?` on `AuditRun`

## Gotchas

- `toFixEdits` extended with optional `cwd` param for display path relativization
- `audit-runner.ts` `createInitialRun` signature is `(req, runId, workdir)` — TS allows fewer params than the spec signature, no change needed
- `writeExecutionSettings` is called BOTH on workdir (Nakiros artefacts) AND on worktreePath (so Claude reads settings from its actual cwd)
- For skill runs: the first prompt still says `workdir` as the "working directory of the skill" — but the slash-command resolves via `.claude/skills/<name>` symlink from the worktree cwd

## Reste à faire

- First prompt for skill runs could be updated to mention "project root accessible at your cwd" — deferred
- No frontend changes needed for this PR (worktree is daemon-only)
- `audit-runner.ts` could also benefit from worktree support but is not covered yet
