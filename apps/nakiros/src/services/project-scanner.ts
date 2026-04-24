import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { Project } from '@nakiros/shared';

import { nakirosFile } from '../utils/nakiros-dir.js';
import { scanClaudeProjects } from './providers/claude-scanner.js';

type StoredProject = Project;

/**
 * Patterns of project paths to purge from the registry. Typically artifacts
 * from Nakiros eval runs auto-recorded by Claude under ~/.claude/projects/.
 */
const PURGE_PATH_PATTERNS: RegExp[] = [
  /\/evals\/workspace\/iteration-\d+\/eval-[^/]+\/(with_skill|without_skill)\/?$/,
];

function isObsoletePath(projectPath: string): boolean {
  return PURGE_PATH_PATTERNS.some((re) => re.test(projectPath));
}

function storagePath(): string {
  return nakirosFile('projects.json');
}

function readAll(): StoredProject[] {
  const path = storagePath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredProject[]) : [];
  } catch {
    return [];
  }
}

function writeAll(projects: StoredProject[]): void {
  writeFileSync(storagePath(), JSON.stringify(projects, null, 2), 'utf-8');
}

function stripInternal(p: StoredProject): Project {
  // `status` stays — it's part of the shared Project type
  return p;
}

/**
 * Scan every provider's project directory for tracked projects, merge with the
 * persisted registry, and write the result back. Dismissed projects stay
 * dismissed across scans; obsolete paths (eval iteration artifacts
 * auto-recorded by Claude) are purged.
 *
 * @param onProgress - optional progress callback: `(current, total, projectName)`
 * @returns every non-dismissed project, as surfaced to the UI
 */
export function scan(
  onProgress?: (current: number, total: number, name: string | null) => void,
): Project[] {
  const now = new Date().toISOString();
  const existing = readAll();

  const kept = existing.filter((p) => !isObsoletePath(p.projectPath));
  const dismissedIds = new Set(kept.filter((p) => p.status === 'dismissed').map((p) => p.id));

  const detected = scanClaudeProjects(onProgress);

  const byId = new Map<string, StoredProject>();
  for (const p of kept) byId.set(p.id, p);

  for (const detectedProject of detected) {
    if (dismissedIds.has(detectedProject.id)) continue;
    const prior = byId.get(detectedProject.id);
    byId.set(detectedProject.id, {
      ...detectedProject,
      lastScannedAt: now,
      createdAt: prior?.createdAt ?? now,
    });
  }

  const all = Array.from(byId.values());
  writeAll(all);

  return all.filter((p) => p.status !== 'dismissed').map(stripInternal);
}

/** Return every non-dismissed project from the persisted registry (no re-scan). */
export function listProjects(): Project[] {
  return readAll().filter((p) => p.status !== 'dismissed').map(stripInternal);
}

/** Look up a project by id in the persisted registry. Returns `null` when unknown. */
export function getProject(id: string): Project | null {
  const project = readAll().find((p) => p.id === id);
  return project ? stripInternal(project) : null;
}

/** Mark a project as `dismissed` so it stops appearing in `listProjects` / `scan` results. */
export function dismissProject(id: string): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], status: 'dismissed' };
  writeAll(all);
}

/** True when at least one non-dismissed project exists. Cheap check used by onboarding gates. */
export function hasProjects(): boolean {
  return readAll().some((p) => p.status !== 'dismissed');
}
