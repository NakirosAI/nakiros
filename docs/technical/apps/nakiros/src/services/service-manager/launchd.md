# service-manager/launchd.ts

macOS LaunchAgent implementation. Manages `~/Library/LaunchAgents/com.nakiros.daemon.plist`.

## Constants

| Name | Value |
|------|-------|
| `LABEL` | `com.nakiros.daemon` |
| `PLIST_PATH` | `~/Library/LaunchAgents/com.nakiros.daemon.plist` |
| `LOG_DIR` | `~/.nakiros/logs/` |
| `OUT_LOG` | `~/.nakiros/logs/daemon.out.log` |
| `ERR_LOG` | `~/.nakiros/logs/daemon.err.log` |

## Exported types

### `ServiceActionResult`

```ts
interface ServiceActionResult {
  success: boolean;
  message: string;
}
```

### `ServiceStatus`

```ts
interface ServiceStatus {
  state: 'running' | 'stopped' | 'unknown';
  pid: number | null;
  logPath: string;
}
```

## Exported functions

### `installLaunchdService(binImportMetaUrl: string): ServiceActionResult`

Generates the plist with `RunAtLoad=true`, `KeepAlive=true`, and absolute
paths for Node + binary, then calls `launchctl bootstrap gui/$UID <plist>`.
Creates `~/.nakiros/logs/` if absent.

### `startLaunchdService(): ServiceActionResult`

Calls `launchctl kickstart -k gui/$UID/com.nakiros.daemon`.

### `stopLaunchdService(): ServiceActionResult`

Calls `launchctl kill SIGTERM gui/$UID/com.nakiros.daemon`. With `KeepAlive=true`,
launchd will restart the daemon.

### `uninstallLaunchdService(): ServiceActionResult`

Calls `launchctl bootout gui/$UID <plist>` then removes the plist file.

### `getLaunchdServiceStatus(): ServiceStatus`

Calls `launchctl print gui/$UID/com.nakiros.daemon` and parses `state =` and
`pid =` lines. Returns `stopped` when the service is not found.

### `formatLaunchdStatus(status: ServiceStatus): string`

Returns a human-readable multi-line string with Service, State, Log, and Plist
fields. Replaces `$HOME` with `~` for readability.
