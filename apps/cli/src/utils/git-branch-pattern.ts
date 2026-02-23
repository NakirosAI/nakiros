import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const DEFAULT_BRANCH_PATTERN = "feature/*";

const IGNORED_BRANCH_NAMES = new Set([
  "main",
  "master",
  "develop",
  "development",
  "dev",
  "trunk",
  "staging",
  "production",
  "prod"
]);

const PATTERN_PRIORITY = [
  "feature/*",
  "feat/*",
  "story/*",
  "chore/*",
  "bugfix/*",
  "fix/*",
  "hotfix/*",
  "task/*",
  "release/*"
];

export interface SuggestBranchPatternOptions {
  cwd?: string;
  listBranches?: (cwd: string) => string[];
}

export function suggestBranchPattern(options: SuggestBranchPatternOptions = {}): string {
  const cwd = resolve(options.cwd ?? process.cwd());

  try {
    const listBranches = options.listBranches ?? listLocalBranches;
    return inferBranchPatternFromBranches(listBranches(cwd));
  } catch {
    return DEFAULT_BRANCH_PATTERN;
  }
}

export function inferBranchPatternFromBranches(branches: string[]): string {
  const counts = new Map<string, number>();

  for (const rawBranch of branches) {
    const pattern = toPattern(rawBranch);
    if (!pattern) {
      continue;
    }

    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return DEFAULT_BRANCH_PATTERN;
  }

  return Array.from(counts.entries())
    .sort((left, right) => {
      const countDelta = right[1] - left[1];
      if (countDelta !== 0) {
        return countDelta;
      }

      const leftPriority = patternPriorityIndex(left[0]);
      const rightPriority = patternPriorityIndex(right[0]);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left[0].localeCompare(right[0]);
    })[0][0];
}

function listLocalBranches(cwd: string): string[] {
  const output = execFileSync(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }
  );

  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toPattern(branchName: string): string | null {
  const normalized = branchName.trim().replace(/^remotes\/origin\//u, "");
  if (normalized.length === 0 || IGNORED_BRANCH_NAMES.has(normalized)) {
    return null;
  }

  if (normalized.includes("/")) {
    const prefix = normalized.split("/")[0].toLowerCase();
    if (prefix.length === 0 || IGNORED_BRANCH_NAMES.has(prefix)) {
      return null;
    }

    return `${prefix}/*`;
  }

  const dashedPrefixMatch = normalized.match(/^([a-z0-9._-]+)-/iu);
  if (dashedPrefixMatch) {
    const prefix = dashedPrefixMatch[1].toLowerCase();
    if (!IGNORED_BRANCH_NAMES.has(prefix)) {
      return `${prefix}/*`;
    }
  }

  return null;
}

function patternPriorityIndex(pattern: string): number {
  const index = PATTERN_PRIORITY.indexOf(pattern);
  return index === -1 ? PATTERN_PRIORITY.length : index;
}
