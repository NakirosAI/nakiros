import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolve `~/.nakiros/` and ensure it exists. Every persisted Nakiros state
 * (preferences, projects registry, bundled skills, analyses, run workdirs,
 * sandboxes) lives under this root.
 */
export function getNakirosDir(): string {
  const dir = join(homedir(), '.nakiros');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Build an absolute path inside `~/.nakiros/` from path segments. Ensures the
 * parent `.nakiros/` directory exists but does NOT create any intermediate
 * subdirectories — callers responsible for creating those when writing.
 */
export function nakirosFile(...parts: string[]): string {
  return join(getNakirosDir(), ...parts);
}
