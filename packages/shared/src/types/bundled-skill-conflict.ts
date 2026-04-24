/**
 * Conflict descriptor between the Nakiros bundled skill (ROM) and a user's live
 * copy. Produced when the user upgrades Nakiros and a bundled skill they've
 * locally edited has also changed in the new version.
 */
export interface BundledSkillConflict {
  skillName: string;
  /** Nakiros version the user last synced from (from manifest). Null if no prior sync. */
  previousVersion: string | null;
  /** Nakiros version currently shipping the ROM. */
  currentVersion: string;
  /** Files the user modified vs the last sync snapshot. Relative paths within the skill directory. */
  userModifiedPaths: string[];
  /** Files that changed in the new ROM vs the last sync snapshot. Relative paths within the skill directory. */
  romChangedPaths: string[];
  /** Paths modified in both — the real merge conflicts. */
  overlappingPaths: string[];
}

/** Per-file diff used to preview a bundled-skill conflict in the UI. */
export interface BundledSkillConflictFileDiff {
  /** Relative path in the skill directory. */
  relativePath: string;
  /** ROM content. Null when the file was removed from ROM. */
  romContent: string | null;
  /** User's live content. Null when the file never existed locally. */
  liveContent: string | null;
  /** True if the file contents look like text (not a binary asset). UI can fall back to an opaque message for binaries. */
  isBinary: boolean;
}

/**
 * Resolution strategy picked by the user for a bundled-skill conflict.
 * - `apply-rom` — overwrite user copy with the ROM version
 * - `keep-mine` — discard ROM changes, keep the local copy
 * - `promote-mine` — turn the local copy into a new user-owned skill
 */
export type BundledSkillConflictResolution =
  | 'apply-rom'
  | 'keep-mine'
  | 'promote-mine';
