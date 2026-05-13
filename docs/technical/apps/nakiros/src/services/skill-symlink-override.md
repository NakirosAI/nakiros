# skill-symlink-override

**Path:** `apps/nakiros/src/services/skill-symlink-override.ts`

Atomic symlink override for `~/.claude/skills/<skillName>` during fix-eval and edit-eval batches. Claude Code's user-global skill discovery resolves symlinks before the project-scoped copy in the eval sandbox, so this module temporarily redirects the user-global link to the in-progress workdir and restores it once the batch completes. The swap is FS-atomic via `rename`; a module-level registry ensures restoration on daemon shutdown.

## Exports

### `SkillOverrideRestore`

Token returned by `acquireSkillOverride`; must be passed back to `releaseSkillOverride` when the override scope ends.

```ts
export interface SkillOverrideRestore {
  previousTarget: string | null;
  wasSymlink: boolean;
  skillName: string;
}
```

- `previousTarget` — Original symlink target (absolute path), or `null` when the path did not exist before the override.
- `wasSymlink` — Whether the prior path was a symlink (always `true` for bundled-skills-managed paths).
- `skillName` — Skill name that was overridden — used to reconstruct the link path on restore.

### `acquireSkillOverride`

```ts
export function acquireSkillOverride(
  skillName: string,
  targetDir: string,
): SkillOverrideRestore | null
```

Atomically points `~/.claude/skills/<skillName>` at `targetDir` for the duration of a fix-eval or edit-eval batch. Uses a tmp-symlink + `renameSync` to make the swap atomic: readers see the old target or the new one, never a missing entry.

Returns a `SkillOverrideRestore` token the caller must pass to `releaseSkillOverride` when the batch finishes (success, failure, stop, or daemon shutdown). Returns `null` when the override could not be acquired (target dir missing, real directory at the path, rename failure) — callers should proceed without the override and log a warning.

Concurrent overrides on the same skill are not supported; callers must serialise per skill (fix-eval batches from a single session naturally arrive sequentially).

Also registers process-level `exit` / `SIGTERM` / `SIGINT` handlers (once) that drain all active overrides on daemon shutdown.

**Parameters:**
- `skillName` — Name of the skill directory under `~/.claude/skills/`.
- `targetDir` — Absolute path to the in-progress workdir (fix or edit temp dir).

**Returns:** A `SkillOverrideRestore` token on success, or `null` when the override could not be installed.

### `releaseSkillOverride`

```ts
export function releaseSkillOverride(restore: SkillOverrideRestore | null): void
```

Restores `~/.claude/skills/<skillName>` to the target it pointed at before `acquireSkillOverride`. Idempotent — passing `null` is a no-op. Best-effort: any FS error is logged but never thrown (this always runs in cleanup paths where throwing would mask the original error).

**Parameters:**
- `restore` — The token returned by `acquireSkillOverride`, or `null` (no-op).
