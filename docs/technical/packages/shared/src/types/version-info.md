# version-info.ts

**Path:** `packages/shared/src/types/version-info.ts`

Shared types for the `meta:*` IPC channels. Drives the "update available" banner and the changelog modal in the Nakiros app.

## Exports

### `interface GetChangelogResult`

Result returned by the `meta:getChangelog` IPC channel.

```ts
export interface GetChangelogResult {
  /** Full raw markdown content of CHANGELOG.md, or empty string if unavailable. */
  markdown: string;
  /** Currently running daemon version — convenience field so the frontend can
   *  scroll to the right section without a separate `meta:getVersionInfo` call. */
  version: string;
}
```

### `interface VersionInfo`

Version info surfaced to the UI: installed Nakiros version plus the latest version published on npm.

```ts
export interface VersionInfo {
  /** Installed Nakiros version (from the package.json at runtime). */
  current: string;
  /** Latest version published on npm. `null` when the lookup failed. */
  latest: string | null;
  /** True when `latest` is higher than `current` (semver compare). */
  updateAvailable: boolean;
  /** npm package name being tracked. */
  packageName: string;
  /** ISO timestamp of the last successful registry fetch, or null if never. */
  checkedAt: string | null;
}
```
