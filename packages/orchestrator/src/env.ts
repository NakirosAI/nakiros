import { existsSync, readdirSync } from 'fs';
import { homedir, platform } from 'os';
import { resolve } from 'path';

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

export function buildEnv(): Record<string, string> {
  const base = process.env as Record<string, string>;
  const current = base['PATH'] ?? '';
  return {
    ...base,
    PATH: current ? `${current}:${extraPaths}` : extraPaths,
  };
}

export function resolveShell(): string {
  if (platform() === 'win32') return 'powershell.exe';
  const candidates = [process.env['SHELL'], '/bin/zsh', '/bin/bash', '/bin/sh'];
  return candidates.find((s) => s && existsSync(s)) ?? '/bin/sh';
}
