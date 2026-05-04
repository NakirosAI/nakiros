import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import type { ConversationIngestSessionKind } from '@nakiros/shared';

import { nakirosFile } from '../../utils/nakiros-dir.js';

/**
 * Directory + file paths used by the conversation-ingest pipeline. Centralised
 * here so both the daemon-side runner and the disk-resident hook script
 * (`hook-stop.cjs`) can agree on the same locations without sharing imports.
 *
 * Layout (V2 — per-project):
 *   ~/.nakiros/ingest/
 *     queue/                      # one JSON file per Stop-hook invocation; deleted after processing
 *     hook-stop.cjs               # the hook script the user opts in to install
 *     index.json                  # global project index (V2 manifest)
 *     manifest.json               # V1 legacy index — wiped on first V2 boot
 *     sessions/                   # V1 legacy session bodies — wiped on first V2 boot
 *     projects/<encoded>/         # one subdir per project; encoded = `<basename>-<sha1[:8]>`
 *       sessions/<sessionId>.json # parsed session bodies for that project
 */

export const INGEST_DIR_NAME = 'ingest';
export const INGEST_QUEUE_SUBDIR = 'queue';
export const INGEST_PROJECTS_SUBDIR = 'projects';
export const INGEST_PROJECT_SESSIONS_SUBDIR = 'sessions';
export const INGEST_PROJECT_DIGESTS_SUBDIR = 'digests';
export const INGEST_INDEX_FILENAME = 'index.json';
export const INGEST_HOOK_SCRIPT_FILENAME = 'hook-stop.cjs';

// V1 legacy paths — used only by the one-shot migration on boot.
export const INGEST_LEGACY_MANIFEST_FILENAME = 'manifest.json';
export const INGEST_LEGACY_SESSIONS_SUBDIR = 'sessions';

export function getIngestDir(): string {
  const dir = nakirosFile(INGEST_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getIngestQueueDir(): string {
  const dir = join(getIngestDir(), INGEST_QUEUE_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getIngestProjectsDir(): string {
  const dir = join(getIngestDir(), INGEST_PROJECTS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getIngestIndexPath(): string {
  return join(getIngestDir(), INGEST_INDEX_FILENAME);
}

export function getIngestHookScriptPath(): string {
  return join(getIngestDir(), INGEST_HOOK_SCRIPT_FILENAME);
}

export function getIngestLegacyManifestPath(): string {
  return join(getIngestDir(), INGEST_LEGACY_MANIFEST_FILENAME);
}

export function getIngestLegacySessionsDir(): string {
  return join(getIngestDir(), INGEST_LEGACY_SESSIONS_SUBDIR);
}

/**
 * Path of the user-global Claude Code settings file we register the Stop hook
 * in. Per-project hooks would only fire inside that project — we want global
 * coverage so every conversation flows through Nakiros.
 */
export function getClaudeGlobalSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/** The shell command Nakiros writes into `~/.claude/settings.json` Stop-hook entries. */
export function getHookCommandString(): string {
  return `node "${getIngestHookScriptPath()}"`;
}

/**
 * Deterministic, filesystem-safe encoding of a project path. Composed of the
 * basename (sanitised, capped at 32 chars) plus 8 hex chars of a SHA-1 hash
 * over the full original path so two projects with the same basename never
 * collide. The mapping is one-way — we never decode the directory name back;
 * the original `projectPath` lives in the index entry.
 *
 * Example: `/Users/x/Perso/timetrackerAgent` → `timetrackerAgent-a1b2c3d4`
 */
export function encodeProjectDirName(projectPath: string): string {
  const base = basename(projectPath) || 'root';
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 32) || 'project';
  const hash = createHash('sha1').update(projectPath).digest('hex').slice(0, 8);
  return `${safeBase}-${hash}`;
}

/** Absolute path of a single project's subdir under `projects/`. */
export function getProjectDir(projectPath: string): string {
  const dir = join(getIngestProjectsDir(), encodeProjectDirName(projectPath));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Absolute path of the per-project sessions/ folder where session bodies live. */
export function getProjectSessionsDir(projectPath: string): string {
  const dir = join(getProjectDir(projectPath), INGEST_PROJECT_SESSIONS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Per-project digests/ folder where the V1.1 friction classifier persists
 * `<sessionId>.json` outputs. Created on demand the first time a digest is
 * generated for the project.
 */
export function getProjectDigestsDir(projectPath: string): string {
  const dir = join(getProjectDir(projectPath), 'digests');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path of a single digest file. Convention: `<sessionId>.json`. */
export function getDigestPath(projectPath: string, sessionId: string): string {
  return join(getProjectDigestsDir(projectPath), `${sessionId}.json`);
}

/**
 * Heuristic that flags a session as Nakiros-internal noise (sandboxes, eval
 * iterations, fix-temp working trees) versus real user activity. Synthetic
 * sessions are still ingested so we keep the option to analyse agent
 * behaviour later, but they're hidden from the default UI list and excluded
 * from the per-project audit feeds.
 *
 * Rules — any one match is enough:
 *  - path contains `/.fix-temp/` (fix-runner sandboxes scattered under user repos)
 *  - path lives under `~/.nakiros/` (every Nakiros workdir + skill workspace)
 *  - path matches `<…>/evals/workspace/iteration-<n>/<…>` (eval iteration sandboxes)
 */
export function classifySessionKind(projectPath: string): ConversationIngestSessionKind {
  if (!projectPath) return 'synthetic';
  if (projectPath.includes('/.fix-temp/')) return 'synthetic';
  const nakirosRoot = join(homedir(), '.nakiros');
  if (projectPath === nakirosRoot || projectPath.startsWith(nakirosRoot + '/')) {
    return 'synthetic';
  }
  if (/\/evals\/workspace\/iteration-[^/]+\//.test(projectPath)) return 'synthetic';
  return 'user';
}
