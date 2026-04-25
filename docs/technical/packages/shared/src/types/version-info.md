# version-info.ts

**Path:** `packages/shared/src/types/version-info.ts`

Shape returned by the `meta:getVersionInfo` IPC call. Drives the "update available" banner in the Nakiros app.

## Exports

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
