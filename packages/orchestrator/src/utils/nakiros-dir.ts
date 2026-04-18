import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function getNakirosDir(): string {
  const dir = join(homedir(), '.nakiros');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function nakirosFile(...parts: string[]): string {
  return join(getNakirosDir(), ...parts);
}
