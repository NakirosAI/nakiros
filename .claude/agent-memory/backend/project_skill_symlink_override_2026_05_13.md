---
name: project_skill_symlink_override_2026_05_13
description: skill-symlink-override module added to fix eval sandbox using prod skill instead of modified workdir
metadata:
  type: project
---

`services/skill-symlink-override.ts` added 2026-05-13 (commit `5b4ee32`).

**Why:** Claude Code's user-global skill discovery (`~/.claude/skills/<name>`) takes precedence over the project-scoped `.claude/skills/` copy that the eval sandbox lays down. So fix/edit evals were reading the prod skill, not the in-progress workdir. The symlink (`bundled-skills-sync.ts:187`) points to `~/.nakiros/skills/<name>/`; overriding it for the duration of the batch forces Claude Code to see the workdir.

**How to apply:** Pattern is `acquire → try { startEvalRuns } catch { release; throw } → registerFixEvalBatch({ onComplete: () => release })`. The `onComplete` callback on `registerFixEvalBatch` fires inside a `finally` block after `finaliseFixEvalBatch`. A module-level `ACTIVE` Map + `process.once('exit'/'SIGTERM'/'SIGINT')` drain handles daemon-shutdown case. Returns `null` on failure (real dir at path, rename error) — callers proceed without the override.

Both `fix:runEvalsInTemp` and `edit:runEvals` (which aliases `registerFixEvalBatch` as `registerEditEvalBatch`) are wired. `create:runEvals` is NOT wired — create runs use a fresh sandbox with no prior prod symlink to worry about.
