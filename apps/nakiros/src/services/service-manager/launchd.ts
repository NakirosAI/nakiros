import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { isNpxCachePath, resolveBinPath, resolveNodeExecutable, serviceWorkingDirectory } from './paths.js';

const LABEL = 'com.nakiros.daemon';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = join(homedir(), '.nakiros', 'logs');
const OUT_LOG = join(LOG_DIR, 'daemon.out.log');
const ERR_LOG = join(LOG_DIR, 'daemon.err.log');

/** Result returned by every service-manager action. */
export interface ServiceActionResult {
  success: boolean;
  message: string;
}

/** Parsed state from `launchctl print`. */
export interface ServiceStatus {
  /** `'stopped'` covers both explicitly-disabled and unloaded states. */
  state: 'running' | 'stopped' | 'unknown';
  pid: number | null;
  logPath: string;
  /** True when the service is stopped because it was explicitly disabled via `launchctl disable`. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Plist generation
// ---------------------------------------------------------------------------

function buildPlist(nodePath: string, binPath: string): string {
  const escaped = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${escaped(nodePath)}</string>
    <string>${escaped(binPath)}</string>
    <string>--no-open</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>WorkingDirectory</key>
  <string>${escaped(serviceWorkingDirectory())}</string>

  <key>StandardOutPath</key>
  <string>${escaped(OUT_LOG)}</string>

  <key>StandardErrorPath</key>
  <string>${escaped(ERR_LOG)}</string>
</dict>
</plist>
`;
}

// ---------------------------------------------------------------------------
// launchctl helpers
// ---------------------------------------------------------------------------

/** Return `gui/$UID` target for the current user. */
function guiTarget(): string {
  return `gui/${process.getuid ? process.getuid() : process.env.UID ?? '501'}`;
}

/**
 * Check whether the service label is currently disabled in the launchd database.
 * Uses `launchctl print-disabled gui/$UID` and looks for the label's entry.
 */
function isServiceDisabled(): boolean {
  const { ok, stdout } = launchctl(['print-disabled', guiTarget()]);
  if (!ok) return false;
  // Output lines look like:  "com.nakiros.daemon" => disabled
  const match = stdout.match(new RegExp(`"${LABEL}"\\s*=>\\s*(\\S+)`));
  if (!match) return false;
  return match[1] === 'disabled';
}

function launchctl(args: string[]): { stdout: string; stderr: string; ok: boolean } {
  try {
    const stdout = execSync(['launchctl', ...args].join(' '), {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', ok: true };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? String(err),
      ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write the LaunchAgent plist and load it via `launchctl bootstrap`.
 *
 * @param binImportMetaUrl - `import.meta.url` forwarded from `bin/nakiros.ts`
 */
export function installLaunchdService(binImportMetaUrl: string): ServiceActionResult {
  const binPath = resolveBinPath(binImportMetaUrl);

  if (isNpxCachePath(binPath)) {
    return {
      success: false,
      message:
        'Detected npx cache path — install via `npm i -g @nakirosai/nakiros` or `brew install` first, then re-run `nakiros service install`.\n' +
        `  Detected path: ${binPath}`,
    };
  }

  const nodePath = resolveNodeExecutable();

  // Ensure log directory exists.
  mkdirSync(LOG_DIR, { recursive: true });

  // Ensure LaunchAgents directory exists (usually already present on macOS).
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });

  const plist = buildPlist(nodePath, binPath);
  writeFileSync(PLIST_PATH, plist, 'utf8');

  // Re-enable the label in case a previous `stop` left it disabled.
  launchctl(['enable', `${guiTarget()}/${LABEL}`]);

  // Bootstrap the service. Ignore "already loaded" errors gracefully.
  const { ok, stderr } = launchctl(['bootstrap', guiTarget(), PLIST_PATH]);
  if (!ok && !stderr.includes('already')) {
    return {
      success: false,
      message: `launchctl bootstrap failed:\n  ${stderr.trim()}\n\nPlist written to: ${PLIST_PATH}`,
    };
  }

  return {
    success: true,
    message:
      `Service installed and started.\n` +
      `  Plist:  ${PLIST_PATH}\n` +
      `  Logs:   ${OUT_LOG}\n` +
      `  Node:   ${nodePath}\n` +
      `  Binary: ${binPath}`,
  };
}

/**
 * Start the service persistently:
 *   1. `launchctl enable` — clears the disabled state so KeepAlive is honoured again.
 *   2. `launchctl bootstrap` — loads the plist into the current session and starts the process.
 *
 * `bootstrap` (not `kickstart`) is used because after a `stop` the plist is fully
 * unloaded via `bootout`; `kickstart` only works on an already-loaded service.
 */
export function startLaunchdService(): ServiceActionResult {
  // Re-enable first so KeepAlive is honoured for this session and after boots.
  launchctl(['enable', `${guiTarget()}/${LABEL}`]);

  const { ok, stderr } = launchctl(['bootstrap', guiTarget(), PLIST_PATH]);
  if (!ok) {
    if (
      stderr.includes('Could not find') ||
      stderr.includes('No such') ||
      stderr.includes('ENOENT')
    ) {
      return {
        success: false,
        message: 'Service is not installed. Run `nakiros service install` first.',
      };
    }
    if (stderr.includes('already')) {
      // Service is already running — treat as success.
      return { success: true, message: 'Service started (was already running).' };
    }
    return { success: false, message: `Failed to start service:\n  ${stderr.trim()}` };
  }
  return { success: true, message: 'Service started.' };
}

/**
 * Stop the service persistently so launchd does not restart it via KeepAlive.
 *
 * With `KeepAlive=true`, sending SIGTERM is not enough — launchd restarts the
 * process immediately. The only reliable approach is:
 *   1. `launchctl disable` — marks the label as disabled in the launchd DB
 *      (prevents RunAtLoad and auto-restart after reboot).
 *   2. `launchctl bootout` — unloads the service from the current session,
 *      which is the only way to stop a KeepAlive process without rebooting.
 */
export function stopLaunchdService(): ServiceActionResult {
  // 1. Disable so KeepAlive won't revive it across boots / future bootstraps.
  launchctl(['disable', `${guiTarget()}/${LABEL}`]);

  // 2. Bootout unloads the service immediately (works even with KeepAlive).
  const { ok, stderr } = launchctl(['bootout', guiTarget(), PLIST_PATH]);
  if (!ok) {
    const notRunning =
      stderr.includes('Could not find') ||
      stderr.includes('No such') ||
      stderr.includes('Bootstrap failed: 3') ||
      stderr.includes(': 3\n');
    if (notRunning) {
      // Already stopped — the disable is still useful (idempotent).
      return { success: true, message: 'Service stopped (was not running).' };
    }
    return { success: false, message: `Failed to stop service:\n  ${stderr.trim()}` };
  }

  return { success: true, message: 'Service stopped.' };
}

/**
 * Unload and remove the LaunchAgent plist.
 *
 * Clears the disabled state before bootout so the label doesn't linger as
 * "disabled" in the launchd database after the plist is gone.
 */
export function uninstallLaunchdService(): ServiceActionResult {
  // Clear any disable state so the label doesn't persist as "disabled" in the DB.
  launchctl(['enable', `${guiTarget()}/${LABEL}`]);

  // Attempt to bootout first; ignore errors if already unloaded.
  launchctl(['bootout', guiTarget(), PLIST_PATH]);

  try {
    unlinkSync(PLIST_PATH);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') {
      return {
        success: false,
        message: `Failed to remove plist: ${e.message}`,
      };
    }
  }

  return { success: true, message: `Service uninstalled. Plist removed: ${PLIST_PATH}` };
}

/**
 * Parse `launchctl print` output to determine the current service state.
 * Also checks `launchctl print-disabled` to surface the disabled flag when
 * the service is stopped (set by `nakiros service stop`).
 */
export function getLaunchdServiceStatus(): ServiceStatus {
  const { ok, stdout, stderr } = launchctl(['print', `${guiTarget()}/${LABEL}`]);

  if (!ok) {
    if (stderr.includes('Could not find') || stderr.includes('No such')) {
      // Service not loaded into current session.
      // Distinguish "stopped (bootedout by nakiros stop)" vs "never installed".
      const plistExists = existsSync(PLIST_PATH);
      if (!plistExists) {
        return { state: 'stopped', pid: null, logPath: OUT_LOG, disabled: false };
      }
      // Plist present but not loaded → stopped by `nakiros service stop`.
      const disabled = isServiceDisabled();
      return { state: 'stopped', pid: null, logPath: OUT_LOG, disabled };
    }
    return { state: 'unknown', pid: null, logPath: OUT_LOG };
  }

  // Parse "state = running" or "state = waiting" lines.
  const stateMatch = stdout.match(/\bstate\s*=\s*(\S+)/);
  const pidMatch = stdout.match(/\bpid\s*=\s*(\d+)/);

  const rawState = stateMatch?.[1] ?? 'unknown';
  const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;

  let state: ServiceStatus['state'];
  if (rawState === 'running') {
    state = 'running';
  } else if (rawState === 'waiting' || rawState === 'stopped' || rawState === 'disabled') {
    state = 'stopped';
  } else {
    state = 'unknown';
  }

  // When stopped, check whether launchd considers the label disabled.
  const disabled = state !== 'running' ? isServiceDisabled() : false;

  return { state, pid: state === 'running' ? pid : null, logPath: OUT_LOG, disabled };
}

/**
 * Format a human-readable status string for `nakiros service status`.
 *
 * When the service is stopped because it was explicitly disabled (via
 * `nakiros service stop`), the state line shows `stopped (disabled)` to
 * distinguish it from "not installed".
 */
export function formatLaunchdStatus(status: ServiceStatus): string {
  const pidPart = status.pid !== null ? ` (pid ${status.pid})` : '';
  const stateLabel =
    status.state === 'stopped' && status.disabled
      ? 'stopped (disabled)'
      : `${status.state}${pidPart}`;
  const logShort = status.logPath.replace(homedir(), '~');
  return [
    `Service: nakiros`,
    `State:   ${stateLabel}`,
    `Log:     ${logShort}`,
    `Plist:   ${PLIST_PATH.replace(homedir(), '~')}`,
  ].join('\n');
}
