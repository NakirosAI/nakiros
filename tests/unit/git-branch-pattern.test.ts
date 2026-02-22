import { describe, expect, it } from "vitest";

import {
  DEFAULT_BRANCH_PATTERN,
  inferBranchPatternFromBranches,
  suggestBranchPattern
} from "../../src/utils/git-branch-pattern.js";

describe("unit: git-branch-pattern", () => {
  it("infers the dominant slash prefix as branch pattern", () => {
    const pattern = inferBranchPatternFromBranches([
      "main",
      "feature/TTA-101",
      "feature/TTA-102",
      "chore/update-readme"
    ]);

    expect(pattern).toBe("feature/*");
  });

  it("falls back to default pattern when no useful branches exist", () => {
    const pattern = inferBranchPatternFromBranches(["main", "master", "develop"]);
    expect(pattern).toBe(DEFAULT_BRANCH_PATTERN);
  });

  it("uses fallback when git branch listing fails", () => {
    const pattern = suggestBranchPattern({
      cwd: "/tmp/example",
      listBranches: () => {
        throw new Error("git unavailable");
      }
    });

    expect(pattern).toBe(DEFAULT_BRANCH_PATTERN);
  });
});
