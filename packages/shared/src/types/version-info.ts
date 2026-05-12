/**
 * Changelog content returned by `meta:getChangelog`. The markdown is the full
 * content of the workspace `CHANGELOG.md` (Keep-a-Changelog format). Empty
 * string means the file could not be resolved at runtime (graceful fallback).
 */
export interface GetChangelogResult {
  /** Full raw markdown content of CHANGELOG.md, or empty string if unavailable. */
  markdown: string;
  /** Currently running daemon version — convenience field so the frontend can
   *  scroll to the right section without a separate `meta:getVersionInfo` call. */
  version: string;
}

/**
 * Version info surfaced to the UI: installed Nakiros version plus the latest
 * version published on npm. Powers the "update available" banner in the app.
 */
export interface VersionInfo {
  /** Installed Nakiros version (from the package.json at runtime). */
  current: string;
  /** Latest version published on npm. `null` when the lookup failed (offline, registry error, etc.). */
  latest: string | null;
  /** True when `latest` is higher than `current` (semver compare). */
  updateAvailable: boolean;
  /** npm package name being tracked. Exposed so the UI can link to it if needed. */
  packageName: string;
  /** ISO timestamp of the last successful registry fetch, or null if never. */
  checkedAt: string | null;
}
