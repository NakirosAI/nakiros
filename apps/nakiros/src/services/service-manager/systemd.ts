import { execSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ServiceActionResult, ServiceStatus } from './launchd.js';
import { isNpxCachePath, resolveBinPath, resolveNodeExecutable, serviceWorkingDirectory } from './paths.js';

const UNIT_DIR = join(homedir(), '.config', 'systemd', 'user');
const UNIT_PATH = join(UNIT_DIR, 'nakiros.service');
const LOG_DIR = join(homedir(), '.nakiros', 'logs');
const OUT_LOG = join(LOG_DIR, 'daemon.out.log');
const SERVICE_NAME = 'nakiros';

// ---------------------------------------------------------------------------
// Unit file generation
// ---------------------------------------------------------------------------

function buildUnit(nodePath: string, binPath: string): string {
  const cwd = serviceWorkingDirectory();
  return [
    '[Unit]',
    'Description=Nakiros daemon — local Claude Code observer',
    'After=network.target',
    '',
    '[Service]',
    `ExecStart=${nodePath} ${binPath} --no-open`,
    `WorkingDirectory=${cwd}`,
    'Restart=always',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// systemctl helpers
// ---------------------------------------------------------------------------

function systemctl(args: string[]): { stdout: string; stderr: string; ok: boolean } {
  try {
    const stdout = execSync(['systemctl', '--user', ...args].join(' '), {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}` },
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
 * Write the systemd user unit and enable + start it.
 *
 * @param binImportMetaUrl - `import.meta.url` forwarded from `bin/nakiros.ts`
 */
export function installSystemdService(binImportMetaUrl: string): ServiceActionResult {
  const binPath = resolveBinPath(binImportMetaUrl);

  if (isNpxCachePath(binPath)) {
    return {
      success: false,
      message:
        'Detected npx cache path — install via `npm i -g @nakirosai/nakiros` first, then re-run `nakiros service install`.\n' +
        `  Detected path: ${binPath}`,
    };
  }

  const nodePath = resolveNodeExecutable();

  mkdirSync(UNIT_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });

  const unit = buildUnit(nodePath, binPath);
  writeFileSync(UNIT_PATH, unit, 'utf8');

  const reload = systemctl(['daemon-reload']);
  if (!reload.ok) {
    return {
      success: false,
      message: `systemctl daemon-reload failed:\n  ${reload.stderr.trim()}`,
    };
  }

  const enable = systemctl(['enable', '--now', SERVICE_NAME]);
  if (!enable.ok) {
    return {
      success: false,
      message: `systemctl enable --now failed:\n  ${enable.stderr.trim()}\n\nUnit written to: ${UNIT_PATH}`,
    };
  }

  return {
    success: true,
    message:
      `Service installed and started.\n` +
      `  Unit:   ${UNIT_PATH}\n` +
      `  Node:   ${nodePath}\n` +
      `  Binary: ${binPath}`,
  };
}

/**
 * Start the systemd user service.
 */
export function startSystemdService(): ServiceActionResult {
  const { ok, stderr } = systemctl(['start', SERVICE_NAME]);
  if (!ok) {
    return { success: false, message: `Failed to start service:\n  ${stderr.trim()}` };
  }
  return { success: true, message: 'Service started.' };
}

/**
 * Stop the systemd user service.
 */
export function stopSystemdService(): ServiceActionResult {
  const { ok, stderr } = systemctl(['stop', SERVICE_NAME]);
  if (!ok) {
    return { success: false, message: `Failed to stop service:\n  ${stderr.trim()}` };
  }
  return { success: true, message: 'Service stopped.' };
}

/**
 * Disable and remove the systemd user unit file.
 */
export function uninstallSystemdService(): ServiceActionResult {
  systemctl(['disable', '--now', SERVICE_NAME]);

  try {
    unlinkSync(UNIT_PATH);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== 'ENOENT') {
      return { success: false, message: `Failed to remove unit file: ${e.message}` };
    }
  }

  const reload = systemctl(['daemon-reload']);
  if (!reload.ok) {
    // Non-fatal — file is gone, that's what matters.
  }

  return { success: true, message: `Service uninstalled. Unit removed: ${UNIT_PATH}` };
}

/**
 * Return the current state of the systemd service.
 */
export function getSystemdServiceStatus(): ServiceStatus {
  const { ok, stdout } = systemctl(['status', SERVICE_NAME]);

  if (!ok && stdout === '') {
    return { state: 'stopped', pid: null, logPath: OUT_LOG };
  }

  const activeMatch = stdout.match(/Active:\s+(\S+)/);
  const pidMatch = stdout.match(/Main PID:\s+(\d+)/);

  const raw = activeMatch?.[1] ?? 'unknown';
  const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;

  let state: ServiceStatus['state'];
  if (raw === 'active') {
    state = 'running';
  } else if (raw === 'inactive' || raw === 'failed') {
    state = 'stopped';
  } else {
    state = 'unknown';
  }

  return { state, pid: state === 'running' ? pid : null, logPath: OUT_LOG };
}

/**
 * Format a human-readable status string for `nakiros service status`.
 */
export function formatSystemdStatus(status: ServiceStatus): string {
  const pidPart = status.pid !== null ? ` (pid ${status.pid})` : '';
  const logShort = status.logPath.replace(homedir(), '~');
  return [
    `Service: nakiros`,
    `State:   ${status.state}${pidPart}`,
    `Log:     ${logShort}`,
    `Unit:    ${UNIT_PATH.replace(homedir(), '~')}`,
  ].join('\n');
}
