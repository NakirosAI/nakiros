import { existsSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

type PtySpawn = typeof import('node-pty').spawn;
type IPty = import('node-pty').IPty;

let cachedSpawn: PtySpawn | null = null;

function resolveNodePtySpawn(): PtySpawn {
  if (cachedSpawn) return cachedSpawn;

  const candidates = ['node-pty'];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'node-pty'));
  }

  for (const candidate of candidates) {
    try {
      const mod = require(candidate) as { spawn?: PtySpawn };
      if (mod.spawn) {
        cachedSpawn = mod.spawn;
        return cachedSpawn;
      }
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('node-pty introuvable dans l’application packagée.');
}

function resolveShell(): string {
  if (platform() === 'win32') return 'powershell.exe';
  // Try in order: user shell from env, then common shell paths
  const candidates = [
    process.env['SHELL'],
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
  ];
  return candidates.find((s) => s && existsSync(s)) ?? '/bin/sh';
}

function resolveEnv(): Record<string, string> {
  const base = process.env as Record<string, string>;
  // Electron launched from Finder/Dock may have a stripped PATH.
  // Augment with common locations so claude/git/npm are found.
  const extraPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':');
  const currentPath = base['PATH'] ?? '';
  return {
    ...base,
    PATH: currentPath ? `${currentPath}:${extraPaths}` : extraPaths,
    TERM: 'xterm-256color',
  };
}

const shell = resolveShell();
const env = resolveEnv();

interface TerminalEntry {
  pty: IPty;
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

const terminals = new Map<string, TerminalEntry>();
let terminalCounter = 0;

export function createTerminal(
  repoPath: string,
  onData: (data: string) => void,
  onExit: (code: number) => void,
): string {
  const terminalId = `term-${++terminalCounter}`;

  // Fallback to home dir if cwd is empty or doesn't exist
  const cwd = repoPath && existsSync(repoPath) ? repoPath : homedir();
  const spawnPty = resolveNodePtySpawn();

  const pty = spawnPty(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env,
  });

  pty.onData(onData);
  pty.onExit(({ exitCode }) => {
    terminals.delete(terminalId);
    onExit(exitCode ?? 0);
  });

  terminals.set(terminalId, { pty, onData, onExit });
  return terminalId;
}

export function writeToTerminal(terminalId: string, data: string): void {
  terminals.get(terminalId)?.pty.write(data);
}

export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
  terminals.get(terminalId)?.pty.resize(cols, rows);
}

export function destroyTerminal(terminalId: string): void {
  const entry = terminals.get(terminalId);
  if (entry) {
    entry.pty.kill();
    terminals.delete(terminalId);
  }
}
