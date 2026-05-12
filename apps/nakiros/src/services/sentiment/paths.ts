import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { nakirosFile } from '../../utils/nakiros-dir.js';
import { getProjectDir } from '../conversation-ingest/paths.js';

export const MODELS_SUBDIR = 'models';
export const SENTIMENT_SUBDIR = 'sentiment';

/**
 * Returns (and creates) the directory where HuggingFace model weights are
 * cached locally: `~/.nakiros/models/`. Passed to `env.cacheDir` so that the
 * @xenova/transformers runtime writes model files here instead of the default
 * XDG cache, keeping all Nakiros state under one root.
 */
export function getModelsDir(): string {
  const dir = nakirosFile(MODELS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Returns (and creates) the per-project sentiment output directory:
 * `~/.nakiros/ingest/projects/<encoded>/sentiment/`. One JSON file per session
 * is written here by the store module.
 */
export function getProjectSentimentDir(projectPath: string): string {
  const dir = join(getProjectDir(projectPath), SENTIMENT_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Absolute path of the sentiment trace file for a given session:
 * `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`.
 */
export function getSentimentTracePath(projectPath: string, sessionId: string): string {
  return join(getProjectSentimentDir(projectPath), `${sessionId}.json`);
}
