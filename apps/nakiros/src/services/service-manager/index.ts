/**
 * Service manager — installs, starts, stops, and monitors the Nakiros daemon
 * as a persistent background service (LaunchAgent on macOS, systemd user unit
 * on Linux). Windows is not supported and prints a clear error.
 *
 * All public functions accept an optional `binImportMetaUrl` parameter that
 * callers should pass as `import.meta.url` from their own module. This is used
 * to resolve the absolute path of the daemon binary at install time.
 */

export type { ServiceActionResult, ServiceStatus } from './launchd.js';

// ---------------------------------------------------------------------------
// Platform dispatch helpers
// ---------------------------------------------------------------------------

function isUnsupportedPlatform(): boolean {
  return process.platform === 'win32';
}

function assertSupported(): void {
  if (isUnsupportedPlatform()) {
    process.stderr.write(
      'nakiros service: not yet supported on Windows.\n' +
        'Track support via: https://github.com/NakirosAI/nakiros/issues\n',
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install the Nakiros daemon as a background service.
 *
 * On macOS: writes `~/Library/LaunchAgents/com.nakiros.daemon.plist` and
 * loads it via `launchctl bootstrap gui/$UID`.
 *
 * On Linux: writes `~/.config/systemd/user/nakiros.service`, runs
 * `systemctl --user daemon-reload && enable --now`.
 *
 * @param binImportMetaUrl - pass `import.meta.url` from `bin/nakiros.ts`
 */
export async function installService(binImportMetaUrl: string): Promise<void> {
  assertSupported();

  if (process.platform === 'darwin') {
    const { installLaunchdService } = await import('./launchd.js');
    const result = installLaunchdService(binImportMetaUrl);
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  } else {
    const { installSystemdService } = await import('./systemd.js');
    const result = installSystemdService(binImportMetaUrl);
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  }
}

/**
 * Start the Nakiros daemon service (must be installed first).
 *
 * On macOS: `launchctl kickstart gui/$UID/com.nakiros.daemon`.
 * On Linux: `systemctl --user start nakiros`.
 */
export async function startService(): Promise<void> {
  assertSupported();

  if (process.platform === 'darwin') {
    const { startLaunchdService } = await import('./launchd.js');
    const result = startLaunchdService();
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  } else {
    const { startSystemdService } = await import('./systemd.js');
    const result = startSystemdService();
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  }
}

/**
 * Stop the Nakiros daemon service without uninstalling it.
 *
 * On macOS: `launchctl kill SIGTERM gui/$UID/com.nakiros.daemon`.
 * On Linux: `systemctl --user stop nakiros`.
 */
export async function stopService(): Promise<void> {
  assertSupported();

  if (process.platform === 'darwin') {
    const { stopLaunchdService } = await import('./launchd.js');
    const result = stopLaunchdService();
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  } else {
    const { stopSystemdService } = await import('./systemd.js');
    const result = stopSystemdService();
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  }
}

/**
 * Unload and delete the service definition file.
 *
 * On macOS: `launchctl bootout`, then removes the plist.
 * On Linux: `systemctl --user disable --now`, then removes the unit file.
 */
export async function uninstallService(): Promise<void> {
  assertSupported();

  if (process.platform === 'darwin') {
    const { uninstallLaunchdService } = await import('./launchd.js');
    const result = uninstallLaunchdService();
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  } else {
    const { uninstallSystemdService } = await import('./systemd.js');
    const result = uninstallSystemdService();
    if (!result.success) {
      process.stderr.write(`Error: ${result.message}\n`);
      process.exit(1);
    }
    process.stdout.write(`${result.message}\n`);
  }
}

/**
 * Print the current state of the Nakiros daemon service to stdout.
 *
 * Output format:
 * ```
 * Service: nakiros
 * State:   running (pid 12345)
 * Log:     ~/.nakiros/logs/daemon.out.log
 * Plist:   ~/Library/LaunchAgents/com.nakiros.daemon.plist
 * ```
 */
export async function getServiceStatus(): Promise<void> {
  assertSupported();

  if (process.platform === 'darwin') {
    const { getLaunchdServiceStatus, formatLaunchdStatus } = await import('./launchd.js');
    const status = getLaunchdServiceStatus();
    process.stdout.write(`${formatLaunchdStatus(status)}\n`);
  } else {
    const { getSystemdServiceStatus, formatSystemdStatus } = await import('./systemd.js');
    const status = getSystemdServiceStatus();
    process.stdout.write(`${formatSystemdStatus(status)}\n`);
  }
}
