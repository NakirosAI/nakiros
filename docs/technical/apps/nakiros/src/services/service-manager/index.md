# service-manager/index.ts

Public API for the Nakiros service manager. Platform-dispatches to `launchd.ts`
(macOS) or `systemd.ts` (Linux). All functions exit the process on error.

## Exports

### `installService(binImportMetaUrl: string): Promise<void>`

Writes the service definition file and loads/enables the service. Refuses if
the binary path is in an npx cache. Callers must pass `import.meta.url` from
`bin/nakiros.ts`.

### `startService(): Promise<void>`

Starts the installed service. Errors if the service is not installed.

### `stopService(): Promise<void>`

Sends SIGTERM to the running service. On macOS with `KeepAlive=true`, launchd
will restart the daemon shortly after — use `uninstall` to permanently stop it.

### `uninstallService(): Promise<void>`

Deregisters and removes the service definition file. The daemon stops without
being restarted.

### `getServiceStatus(): Promise<void>`

Prints human-readable status to stdout:

```
Service: nakiros
State:   running (pid 12345)
Log:     ~/.nakiros/logs/daemon.out.log
Plist:   ~/Library/LaunchAgents/com.nakiros.daemon.plist
```

## Re-exported types

- `ServiceActionResult` — `{ success: boolean; message: string }`
- `ServiceStatus` — `{ state: 'running' | 'stopped' | 'unknown'; pid: number | null; logPath: string }`
