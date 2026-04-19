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
