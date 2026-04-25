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
}

/** Full content payload for a single file diff, consumed by the review UI. */
export interface SkillDiffFilePayload {
  relativePath: string;
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}
