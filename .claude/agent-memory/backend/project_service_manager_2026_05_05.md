---
name: service-manager module shipped 2026-05-05
description: nakiros service install|start|stop|uninstall|status subcommand wired
type: project
---

`nakiros service` subcommand shipped 2026-05-05.

New module: `apps/nakiros/src/services/service-manager/`
- `paths.ts` — `resolveBinPath(importMetaUrl)`, `isNpxCachePath`, `resolveNodeExecutable`, `serviceWorkingDirectory`
- `launchd.ts` — macOS: plist at `~/Library/LaunchAgents/com.nakiros.daemon.plist`, `launchctl bootstrap/bootout/kickstart/kill/print`
- `systemd.ts` — Linux: unit at `~/.config/systemd/user/nakiros.service`, `systemctl --user`
- `index.ts` — public API (`installService`, `startService`, `stopService`, `uninstallService`, `getServiceStatus`), platform dispatch, Windows exits 1 with clear message

Wired in `bin/nakiros.ts` after `baseline:cleanup` dispatch. Passes `import.meta.url` to `installService()`.

**Key gotchas:**
- `KeepAlive=true` + `SIGTERM` alone: launchd restarts the process IMMEDIATELY before `kill` returns. `launchctl disable` alone also does NOT prevent the running instance from being kept alive — it only affects future bootstraps.
- **Correct persistent-stop pattern on macOS**: `launchctl disable gui/$UID/label` + `launchctl bootout gui/$UID /path/to.plist`. The `bootout` fully unloads the service from the current session, which is the only way to stop a KeepAlive process without rebooting. `kickstart` / `kill` do NOT work as a stop mechanism with KeepAlive.
- **Correct persistent-start pattern on macOS**: `launchctl enable gui/$UID/label` + `launchctl bootstrap gui/$UID /path/to.plist`. Must pass the plist path (not just the label), because the service was fully booted-out.
- `install` does `enable` before `bootstrap` in case a previous `stop` left the label disabled.
- `uninstall` does `enable` before `bootout` to clear the disabled state from the launchd DB (otherwise the label persists as "disabled" even after the plist is removed, which can block a future `install`).
- `status` with disabled service: when `launchctl print` returns "Could not find" AND the plist exists, the service was stopped via `bootout`. `isServiceDisabled()` checks `launchctl print-disabled gui/$UID` for `"com.nakiros.daemon" => disabled`. `formatLaunchdStatus` shows `stopped (disabled)` in that case.
- `ServiceStatus` now has `disabled?: boolean` field.
- `launchctl bootstrap gui/$UID <plist>` (not the deprecated `load`) for loading. `bootout` for unloading.
- `__dirname` does not exist in ESM — use `fileURLToPath(import.meta.url)` from the caller.
- npx cache detection: patterns match `.npm/_npx/`, `Library/Caches/_npx/`, `Library/Caches/npm/`, `.cache/npx/`.
- `execSync` errors include stdout/stderr on the error object, not in the thrown message — cast to `{ stdout?, stderr?, message? }`.
- Linux/systemd: `systemctl --user stop` with `Restart=always` is already persistent-stop (service stays stopped until explicit `start`). No changes needed.

**Validated on Darwin 25.3.0** (2026-05-05 fix): install → status (running) → stop → sleep 2 → status (stopped (disabled)) → start → status (running) → uninstall. All correct.
