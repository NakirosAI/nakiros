import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

import type {
  ConversationDigest,
  ConversationDigestSummary,
} from '@nakiros/shared';

import { getDigestPath, getProjectDigestsDir } from './paths.js';

/**
 * Lazy-load helpers around the persisted V1.1 friction classifier output.
 *
 * The classifier itself runs through the streaming `classify-convo-runner`
 * (`apps/nakiros/src/services/classify-convo-runner.ts`). This module owns
 * read/write of the resulting `ConversationDigest` JSON files under
 * `~/.nakiros/ingest/projects/<encoded>/digests/<sessionId>.json` and the
 * compact summary list consumed by the UI.
 */

/** Lazy cache read — returns the persisted digest, or `null` when none exists. */
export function loadDigest(projectPath: string, sessionId: string): ConversationDigest | null {
  const path = getDigestPath(projectPath, sessionId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ConversationDigest;
  } catch {
    return null;
  }
}

/** Persist a digest to disk under the per-project digests folder. */
export function persistDigest(digest: ConversationDigest): void {
  // Ensures the per-project digests dir exists before writing.
  getProjectDigestsDir(digest.projectPath);
  const path = getDigestPath(digest.projectPath, digest.sessionId);
  writeFileSync(path, JSON.stringify(digest, null, 2));
}

/**
 * List every digest stored for a project. Returns the compact summary the UI
 * needs to render at-a-glance status without loading every full digest.
 */
export function listDigestsForProject(projectPath: string): ConversationDigestSummary[] {
  const dir = getProjectDigestsDir(projectPath);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: ConversationDigestSummary[] = [];
  for (const file of files) {
    const sessionId = file.replace(/\.json$/, '');
    try {
      const raw = readFileSync(`${dir}/${file}`, 'utf8');
      const digest = JSON.parse(raw) as ConversationDigest;
      out.push({
        sessionId,
        status: 'ready',
        generatedAt: digest.generatedAt ?? null,
        model: digest.model ?? null,
        frictionCount: Array.isArray(digest.frictions) ? digest.frictions.length : 0,
        ruleCount: Array.isArray(digest.extractedRules) ? digest.extractedRules.length : 0,
        error: null,
      });
    } catch {
      out.push({
        sessionId,
        status: 'failed',
        generatedAt: null,
        model: null,
        frictionCount: 0,
        ruleCount: 0,
        error: 'Failed to parse digest file',
      });
    }
  }
  return out;
}
