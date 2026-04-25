import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { homedir, platform } from 'os';
import { join, resolve } from 'path';
import type { AgentProvider } from '@nakiros/shared';

/**
 * Install status for one agent CLI (claude / codex / cursor-agent). `path` and
 * `version` populate when the binary is on PATH and responds to `--version`.
 */
export interface AgentCliStatus {
  provider: AgentProvider;
  label: string;
  command: string;
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
}

interface ProviderSpec {
  provider: AgentProvider;
  label: string;
  command: string;
  versionArgs: string[];
}

const PROVIDERS: ProviderSpec[] = [
  { provider: 'claude', label: 'Claude Code', command: 'claude', versionArgs: ['--version'] },
  { provider: 'codex', label: 'Codex', command: 'codex', versionArgs: ['--version'] },
  { provider: 'cursor', label: 'Cursor Agent', command: 'cursor-agent', versionArgs: ['--version'] },
];

function collectManagerPaths(): string[] {
  const home = homedir();
  const paths: string[] = [
    resolve(home, '.volta/bin'),
    resolve(home, '.asdf/shims'),
    resolve(home, '.nvm/current/bin'),
    resolve(home, '.fnm'),
  ];

  const nvmVersionsDir = resolve(home, '.nvm/versions/node');
  if (existsSync(nvmVersionsDir)) {
    for (const entry of readdirSync(nvmVersionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(resolve(nvmVersionsDir, entry.name, 'bin'));
    }
  }

  const fnmVersionsDir = resolve(home, '.local/share/fnm/node-versions');
  if (existsSync(fnmVersionsDir)) {
    for (const entry of readdirSync(fnmVersionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(resolve(fnmVersionsDir, entry.name, 'installation/bin'));
    }
  }

  return paths.filter((p, i, arr) => existsSync(p) && arr.indexOf(p) === i);
}

const extraPaths = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
  `${homedir()}/.npm-global/bin`,
  ...collectManagerPaths(),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
].join(':');

function buildEnv(): Record<string, string> {
  const base = process.env as Record<string, string>;
  const current = base['PATH'] ?? '';
  return {
    ...base,
    PATH: current ? `${current}:${extraPaths}` : extraPaths,
  };
}

function resolveShell(): string {
  if (platform() === 'win32') return 'powershell.exe';
  const candidates = [process.env['SHELL'], '/bin/zsh', '/bin/bash', '/bin/sh'];
  return candidates.find((s) => s && existsSync(s)) ?? '/bin/sh';
}

function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function runShellCommand(commandLine: string, timeout: number) {
  const currentPlatform = platform();
  const shell = resolveShell();
  const args =
    currentPlatform === 'win32'
      ? ['-NoProfile', '-Command', commandLine]
      : ['-l', '-c', commandLine];

  return spawnSync(shell, args, {
    encoding: 'utf8',
    timeout,
    env: buildEnv(),
  });
}

function firstNonEmptyLine(value: string): string | undefined {
  for (const line of value.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function resolveCommandPath(command: string): string | undefined {
  const result =
    platform() === 'win32'
      ? runShellCommand(`(Get-Command ${command} -ErrorAction SilentlyContinue).Source`, 5000)
      : runShellCommand(`command -v '${shellEscape(command)}'`, 5000);

  if (result.status !== 0) return undefined;
  return firstNonEmptyLine(result.stdout ?? '');
}

function detectVersion(command: string, args: string[]): { version?: string; error?: string } {
  const currentPlatform = platform();
  const quotedArgs =
    currentPlatform === 'win32'
      ? args.join(' ')
      : args.map((arg) => `'${shellEscape(arg)}'`).join(' ');

  const commandLine =
    currentPlatform === 'win32'
      ? `${command} ${quotedArgs}`.trim()
      : `'${shellEscape(command)}' ${quotedArgs}`.trim();

  const result = runShellCommand(commandLine, 7000);

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    return { error: err.code ?? err.message };
  }

  if (result.status !== 0) {
    return {
      error:
        firstNonEmptyLine(result.stderr ?? '') ??
        firstNonEmptyLine(result.stdout ?? '') ??
        `exit:${String(result.status)}`,
    };
  }

  return {
    version: firstNonEmptyLine(result.stdout ?? '') ?? firstNonEmptyLine(result.stderr ?? ''),
  };
}

/**
 * Detect which of `claude`, `codex`, `cursor-agent` are installed by probing a
 * login shell with a PATH augmented for common Node version managers (nvm,
 * fnm, volta, asdf) and standard package install locations. Returns one entry
 * per provider with `installed: true` whenever the binary is found OR the
 * `--version` probe succeeds.
 */
export function getAgentCliStatus(): AgentCliStatus[] {
  return PROVIDERS.map((provider) => {
    const path = resolveCommandPath(provider.command);
    const versionInfo = detectVersion(provider.command, provider.versionArgs);
    const canExecute = !versionInfo.error;

    if (!path && !canExecute) {
      return {
        provider: provider.provider,
        label: provider.label,
        command: provider.command,
        installed: false,
        error: 'not_found',
      };
    }

    return {
      provider: provider.provider,
      label: provider.label,
      command: provider.command,
      installed: true,
      path,
      version: versionInfo.version,
      error: versionInfo.error,
    };
  });
}
