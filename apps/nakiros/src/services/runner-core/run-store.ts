import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const RUN_FILE = 'run.json';

/**
 * Persist a run's state blob to `{workdir}/run.json`. Used as the authoritative
 * record for crash recovery — the daemon reads these files on boot to rehydrate
 * in-flight runs that were interrupted by a restart.
 *
 * Runners may stash domain-specific recovery metadata inside the blob (e.g.
 * fix-runner uses `_mode` + `_realSkillDir` to remember sync-back context).
 */
export function persistRunJson<T extends object>(workdir: string, blob: T): void {
  try {
    writeFileSync(join(workdir, RUN_FILE), JSON.stringify(blob, null, 2), 'utf8');
  } catch {
    // ignore — best-effort persistence
  }
}

export function loadRunJson<T>(workdir: string): T | null {
  const path = join(workdir, RUN_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}
