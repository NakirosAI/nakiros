# service-manager

Installs, starts, stops, and monitors the Nakiros daemon as a persistent
background service. Platform-dispatches between launchd (macOS) and systemd
user units (Linux). Windows prints a clear "not supported" message.

## Files

| File | Purpose |
|------|---------|
| [index.ts](index.md) | Public API — `installService`, `startService`, `stopService`, `uninstallService`, `getServiceStatus` |
| [paths.ts](paths.md) | Binary path resolution, npx-cache detection, Node executable resolution |
| [launchd.ts](launchd.md) | macOS LaunchAgent implementation (plist generation + launchctl wrappers) |
| [systemd.ts](systemd.md) | Linux systemd user-unit implementation (unit generation + systemctl wrappers) |

## Wiring

Invoked from `bin/nakiros.ts` via the `service` subcommand:

```
nakiros service install | start | stop | uninstall | status
```

The bin entry passes its own `import.meta.url` to `installService()` so that
paths are resolved relative to the actual running binary, not this module.

## Key design decisions

- **npx-cache guard**: if the resolved binary path matches a known npx/npm
  cache pattern, `install` refuses with a clear error message.
- **KeepAlive / Restart=always**: the service is always configured to restart
  on crash. `stop` sends SIGTERM but launchd will restart the daemon unless
  `uninstall` is called.
- **Absolute paths in plist/unit**: the Node binary path comes from
  `process.execPath` (pinned to the installed Node version) and the daemon
  binary path is real-pathed at install time.
- **Logs**: `~/.nakiros/logs/daemon.out.log` and `daemon.err.log` (created on
  install).
