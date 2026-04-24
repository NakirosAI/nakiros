# version-service.ts

**Path:** `apps/nakiros/src/services/version-service.ts`

Powers the `meta:getVersionInfo` IPC call. Reads the current installed version from the daemon's `package.json`, fetches the latest version from the npm registry (cached 6h, 4s timeout, in-flight dedupe), and compares both with a simple semver check.

## Exports

### `function getVersionInfo`

Build the `VersionInfo` payload surfaced to the UI. `updateAvailable` is true when the fetched npm version is strictly greater than the current one. Network errors fall back to the stale cache when one exists; otherwise `latest: null`.

```ts
export async function getVersionInfo(options?: { force?: boolean }): Promise<VersionInfo>
```

**Parameters:**
- `options.force` — bypass the 6h cache and hit npm again.
