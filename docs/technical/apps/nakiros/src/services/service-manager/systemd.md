# service-manager/systemd.ts

Linux systemd user-unit implementation. Manages `~/.config/systemd/user/nakiros.service`.

## Constants

| Name | Value |
|------|-------|
| `UNIT_DIR` | `~/.config/systemd/user/` |
| `UNIT_PATH` | `~/.config/systemd/user/nakiros.service` |
| `LOG_DIR` | `~/.nakiros/logs/` |
| `SERVICE_NAME` | `nakiros` |

## Unit file shape

```ini
[Unit]
Description=Nakiros daemon — local Claude Code observer
After=network.target

[Service]
ExecStart=<node> <bin> --no-open
WorkingDirectory=<home>
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

## Exported functions

### `installSystemdService(binImportMetaUrl: string): ServiceActionResult`

Writes the unit file, runs `systemctl --user daemon-reload`, then
`systemctl --user enable --now nakiros`.

### `startSystemdService(): ServiceActionResult`

Calls `systemctl --user start nakiros`.

### `stopSystemdService(): ServiceActionResult`

Calls `systemctl --user stop nakiros`.

### `uninstallSystemdService(): ServiceActionResult`

Calls `systemctl --user disable --now nakiros`, removes the unit file, then
calls `systemctl --user daemon-reload`.

### `getSystemdServiceStatus(): ServiceStatus`

Calls `systemctl --user status nakiros` and parses `Active:` and `Main PID:`
lines.

### `formatSystemdStatus(status: ServiceStatus): string`

Returns a human-readable multi-line string with Service, State, Log, and Unit
fields. Replaces `$HOME` with `~` for readability.
