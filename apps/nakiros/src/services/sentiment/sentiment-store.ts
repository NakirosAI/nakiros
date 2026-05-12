import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import type { SentimentTrace } from '@nakiros/shared';

import { getSentimentTracePath } from './paths.js';

/**
 * Read a persisted sentiment trace for a given session. Returns `null` if no
 * trace exists or if the on-disk file is malformed.
 */
export function loadSentimentTrace(
  projectPath: string,
  sessionId: string,
): SentimentTrace | null {
  const path = getSentimentTracePath(projectPath, sessionId);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as SentimentTrace;
    if (!parsed.sessionId || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Atomic write — `<sid>.json.tmp` then rename. Prevents partial reads. */
export function persistSentimentTrace(trace: SentimentTrace): void {
  const path = getSentimentTracePath(trace.projectPath, trace.sessionId);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(trace, null, 2));
  renameSync(tmp, path);
}
