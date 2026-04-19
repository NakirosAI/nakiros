/**
 * Shared shape for reviewing the diff between a skill's real on-disk state and
 * an in-progress edit (fix or create run).
 */

export interface SkillDiffEntry {
  relativePath: string;
  /** True if the file exists on the original (pre-edit) side. */
  inOriginal: boolean;
  /** True if the file exists on the modified (post-edit) side. */
  inModified: boolean;
}

export interface SkillDiffFilePayload {
  relativePath: string;
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}
