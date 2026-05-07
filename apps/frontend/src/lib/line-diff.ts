/**
 * Client-side line-level diff helper.
 *
 * Produces an array of annotated line records from `originalContent` and
 * `modifiedContent` using a standard patience-diff / LCS algorithm.  The
 * result drives the green/red highlighting in `IdeCodeViewer`.
 *
 * No external deps — the bundle already imports `diff` (used by
 * `SkillDiffView`), but this module re-implements a simpler line diff to
 * remain independent of that import chain (and to produce the specific
 * output shape needed by the code viewer).
 *
 * Port of the logic in `apps/nakiros/src/services/fix-runner.ts:countLineDiff`
 * extended to produce per-line annotations instead of just counts.
 */

/** Kind of change for a single line in the annotated diff. */
export type LineDiffKind = 'unchanged' | 'added' | 'removed';

/** One annotated line in the diff output. */
export interface DiffLine {
  /** The raw text of this line (without the trailing newline). */
  line: string;
  /** Whether this line was added, removed, or is identical in both versions. */
  kind: LineDiffKind;
  /**
   * 1-based line number in the **modified** file for `unchanged` and `added`
   * lines, or in the **original** file for `removed` lines.
   */
  lineNo: number;
}

// ─── LCS-based line diff ─────────────────────────────────────────────────────

/**
 * Compute the Longest Common Subsequence (LCS) of two string arrays.
 * Returns the table of LCS lengths — used by {@link computeLineDiff} to
 * backtrack the edit script.
 *
 * Classic O(m×n) DP.  For files larger than 2 000 lines the algorithm falls
 * back to a fast heuristic (direct line comparison with no backtracking) to
 * keep the UI responsive.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  // Safety cap: for very large files skip the full LCS and fall back to the
  // caller using a simpler strategy.
  if (m * n > 4_000_000) {
    // Signal fallback: return an empty table.
    return [];
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtrack through the LCS table to emit the annotated edit script.
 * Fills `out` in-place.
 */
function backtrack(
  dp: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
  out: Array<{ line: string; kind: LineDiffKind; srcLine: number; dstLine: number }>,
): void {
  if (i === 0 && j === 0) return;
  if (i === 0) {
    backtrack(dp, a, b, i, j - 1, out);
    out.push({ line: b[j - 1], kind: 'added', srcLine: 0, dstLine: j });
  } else if (j === 0) {
    backtrack(dp, a, b, i - 1, j, out);
    out.push({ line: a[i - 1], kind: 'removed', srcLine: i, dstLine: 0 });
  } else if (a[i - 1] === b[j - 1]) {
    backtrack(dp, a, b, i - 1, j - 1, out);
    out.push({ line: a[i - 1], kind: 'unchanged', srcLine: i, dstLine: j });
  } else if (dp[i][j - 1] >= dp[i - 1][j]) {
    backtrack(dp, a, b, i, j - 1, out);
    out.push({ line: b[j - 1], kind: 'added', srcLine: 0, dstLine: j });
  } else {
    backtrack(dp, a, b, i - 1, j, out);
    out.push({ line: a[i - 1], kind: 'removed', srcLine: i, dstLine: 0 });
  }
}

/**
 * Compute a line-level diff between `originalContent` and `modifiedContent`.
 *
 * Returns an array of {@link DiffLine} entries in display order (matching the
 * visual sequence of the modified file with removed lines interleaved before
 * their replacement).  Added and removed lines can be intermixed when the
 * algorithm produces a replace block.
 *
 * For very large files (> ~2 000 lines each) the function falls back to a
 * simple line-by-line comparison that shows all original lines as removed
 * followed by all new lines as added — not ideal visually, but always correct
 * and fast.
 */
export function computeLineDiff(
  originalContent: string,
  modifiedContent: string,
): DiffLine[] {
  const a = originalContent.split('\n');
  const b = modifiedContent.split('\n');

  const dp = lcsTable(a, b);

  // Fallback for very large files.
  if (dp.length === 0) {
    const out: DiffLine[] = [];
    a.forEach((line, idx) => out.push({ line, kind: 'removed', lineNo: idx + 1 }));
    b.forEach((line, idx) => out.push({ line, kind: 'added', lineNo: idx + 1 }));
    return out;
  }

  const raw: Array<{ line: string; kind: LineDiffKind; srcLine: number; dstLine: number }> = [];
  // The recursion can hit the JS call stack limit for large files.  Wrap and
  // fall back gracefully.
  try {
    backtrack(dp, a, b, a.length, b.length, raw);
  } catch {
    // Stack overflow — fall back to the simple strategy.
    const out: DiffLine[] = [];
    a.forEach((line, idx) => out.push({ line, kind: 'removed', lineNo: idx + 1 }));
    b.forEach((line, idx) => out.push({ line, kind: 'added', lineNo: idx + 1 }));
    return out;
  }

  // Convert raw entries to DiffLine, assigning the correct lineNo.
  // For 'added'/'unchanged' lines lineNo is their position in the modified file (dstLine).
  // For 'removed' lines lineNo is their position in the original file (srcLine).
  return raw.map((r) => ({
    line: r.line,
    kind: r.kind,
    lineNo: r.kind === 'removed' ? r.srcLine : r.dstLine,
  }));
}
