import { homedir } from 'os';
import { join } from 'path';
import { existsSync, lstatSync, readlinkSync, renameSync, symlinkSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';

/**
 * Holds enough information to restore the symlink at
 * `~/.claude/skills/<skillName>` after a temporary override.
 * Obtained from {@link acquireSkillOverride}; must be passed back to
 * {@link releaseSkillOverride} when the override scope ends.
 */
export interface SkillOverrideRestore {
  /** Original symlink target (absolute path), or `null` when the path did not exist. */
  previousTarget: string | null;
  /** Whether the prior path was a symlink (always `true` for bundled-skills-managed paths). */
  wasSymlink: boolean;
  /** Skill name that was overridden — used to reconstruct the link path. */
  skillName: string;
}

// ── Module-level registry of active overrides ──────────────────────────────

const ACTIVE: Map<string, SkillOverrideRestore> = new Map();

let shutdownRegistered = false;

/** Drain all active overrides on process exit/signal (best-effort). */
function ensureShutdownHook(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;
  const drain = () => {
    for (const restore of ACTIVE.values()) {
      releaseSkillOverride(restore);
    }
    ACTIVE.clear();
  };
  process.once('exit', drain);
  process.once('SIGTERM', drain);
  process.once('SIGINT', drain);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Atomically point `~/.claude/skills/<skillName>` at `targetDir` for the
 * duration of a fix-eval or edit-eval batch.
 *
 * The swap is FS-atomic via `rename`: a temporary symlink is created in the
 * same parent directory and then renamed over the existing path in one
 * syscall. Readers either see the old target or the new one — never a missing
 * entry.
 *
 * Returns a {@link SkillOverrideRestore} token that the caller **MUST** pass
 * back to {@link releaseSkillOverride} when the batch finishes (success,
 * failure, stop, or daemon shutdown). Returns `null` when the override could
 * not be acquired (target dir missing, real directory at the path, rename
 * failure) — in those cases callers should proceed without the override and
 * log a warning; the worst outcome is the eval sees the prod skill instead of
 * the modified copy.
 *
 * Concurrent overrides on the SAME skill are not supported: the second call
 * would silently replace the first caller's saved target, corrupting the
 * restore chain. Callers must serialise per skill (fix-eval batches for the
 * same skill from a single session naturally arrive sequentially).
 */
export function acquireSkillOverride(
  skillName: string,
  targetDir: string,
): SkillOverrideRestore | null {
  ensureShutdownHook();

  if (!existsSync(targetDir)) {
    console.warn(`[skill-override] target dir does not exist: ${targetDir}`);
    return null;
  }

  const linkPath = join(homedir(), '.claude', 'skills', skillName);

  let previousTarget: string | null = null;
  let wasSymlink = false;
  try {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      previousTarget = readlinkSync(linkPath);
      wasSymlink = true;
    } else {
      // Real directory at this path — not managed by bundled-skills-sync;
      // refuse to clobber because we cannot safely restore a directory.
      console.warn(
        `[skill-override] ~/.claude/skills/${skillName} is a real directory; refusing to override.`,
      );
      return null;
    }
  } catch {
    // ENOENT — nothing at the path yet; previousTarget stays null.
  }

  // Place a tmp symlink next to the link then atomically rename it over.
  const tmpPath = `${linkPath}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    symlinkSync(targetDir, tmpPath);
    renameSync(tmpPath, linkPath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore cleanup errors */
    }
    console.warn(
      `[skill-override] failed to install override for ${skillName}: ${(err as Error).message}`,
    );
    return null;
  }

  const restore: SkillOverrideRestore = { previousTarget, wasSymlink, skillName };
  ACTIVE.set(skillName, restore);
  console.log(
    `[skill-override] installed override ${skillName} → ${targetDir} (was ${previousTarget ?? 'absent'})`,
  );
  return restore;
}

/**
 * Restore `~/.claude/skills/<skillName>` to the target it pointed at before
 * {@link acquireSkillOverride}. Idempotent — passing `null` is a no-op.
 * Best-effort: any FS error is logged but never thrown (this always runs in
 * cleanup paths where throwing would mask the original error).
 */
export function releaseSkillOverride(restore: SkillOverrideRestore | null): void {
  if (!restore) return;

  ACTIVE.delete(restore.skillName);

  const linkPath = join(homedir(), '.claude', 'skills', restore.skillName);

  // Remove whatever is currently at the path (the override symlink).
  try {
    unlinkSync(linkPath);
  } catch {
    // Already gone or never created — not an error.
  }

  if (restore.previousTarget === null) {
    // Nothing to put back — the path did not exist before the override.
    console.log(`[skill-override] released override ${restore.skillName} (path removed)`);
    return;
  }

  try {
    symlinkSync(restore.previousTarget, linkPath);
    console.log(
      `[skill-override] restored ${restore.skillName} → ${restore.previousTarget}`,
    );
  } catch (err) {
    console.warn(
      `[skill-override] failed to restore ${restore.skillName} → ${restore.previousTarget}: ${(err as Error).message}`,
    );
  }
}
