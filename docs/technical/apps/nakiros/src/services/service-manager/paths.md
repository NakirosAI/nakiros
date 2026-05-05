# service-manager/paths.ts

Binary path resolution utilities used by both `launchd.ts` and `systemd.ts`.

## Exports

### `resolveBinPath(binImportMetaUrl: string): string`

Converts `import.meta.url` from the bin entry to a real, canonicalized
absolute path via `realpathSync`. Falls back to the raw path if the symlink is
broken.

### `isNpxCachePath(binPath: string): boolean`

Returns `true` if `binPath` is inside a transient npx/npm cache directory.
Checks against patterns for `.npm/_npx/`, `Library/Caches/_npx/`,
`Library/Caches/npm/`, and `.cache/npx/`.

### `resolveNodeExecutable(): string`

Returns `process.execPath` — the Node binary that is currently running. Used
in the plist/unit `ProgramArguments` / `ExecStart` so the service always
starts with the same Node version.

### `serviceWorkingDirectory(): string`

Returns `homedir()`. Used as `WorkingDirectory` in both the plist and the
systemd unit.
