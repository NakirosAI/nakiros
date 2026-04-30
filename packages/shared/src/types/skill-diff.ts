/**
 * Shared shape for reviewing the diff between a skill's real on-disk state and
 * an in-progress edit (fix or create run).
 */

/** One entry in the diff listing between the original skill and the in-progress edit. */
export interface SkillDiffEntry {
  relativePath: string;
  /** True if the file exists on the original (pre-edit) side. */
  inOriginal: boolean;
  /** True if the file exists on the modified (post-edit) side. */
  inModified: boolean;
  /**
   * Number of lines added in the modified version vs the original — counted
   * via a simple LCS on UTF-8 lines. `0` for binary files, deleted files
   * (the whole file is in `removedLines` instead), or when the daemon could
   * not compute the diff.
   */
  addedLines: number;
  /**
   * Number of lines removed from the original version. `0` for binary or
   * brand-new files (whole file is in `addedLines`).
   */
  removedLines: number;
}

/** Full content payload for a single file diff, consumed by the review UI. */
export interface SkillDiffFilePayload {
  relativePath: string;
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}
