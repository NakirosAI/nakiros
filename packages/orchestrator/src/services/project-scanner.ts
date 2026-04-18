import { eq, ne } from 'drizzle-orm';

import { getDb, dbSchema } from '@nakiros/server';
import type { Project } from '@nakiros/shared';

import { scanClaudeProjects } from './providers/claude-scanner.js';

/**
 * Patterns of project paths to purge from the registry. These are typically
 * artifacts from Nakiros eval runs that Claude auto-records under ~/.claude/projects/.
 */
const PURGE_PATH_PATTERNS: RegExp[] = [
  /\/evals\/workspace\/iteration-\d+\/eval-[^/]+\/(with_skill|without_skill)\/?$/,
];

function isObsoletePath(projectPath: string): boolean {
  return PURGE_PATH_PATTERNS.some((re) => re.test(projectPath));
}

export function scan(
  onProgress?: (current: number, total: number, name: string | null) => void,
): Project[] {
  const now = new Date().toISOString();
  const db = getDb();

  const allRows = db
    .select({ id: dbSchema.projects.id, projectPath: dbSchema.projects.projectPath })
    .from(dbSchema.projects)
    .all();
  for (const row of allRows as Array<{ id: string; projectPath: string }>) {
    if (isObsoletePath(row.projectPath)) {
      db.delete(dbSchema.projects).where(eq(dbSchema.projects.id, row.id)).run();
    }
  }

  const dismissedRows = db
    .select({ id: dbSchema.projects.id })
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.status, 'dismissed'))
    .all();
  const dismissedIds = new Set(dismissedRows.map((r: { id: string }) => r.id));

  const detected = scanClaudeProjects(onProgress);

  const validProjects = detected.filter((p) => !dismissedIds.has(p.id));

  for (const p of validProjects) {
    db.insert(dbSchema.projects)
      .values({
        id: p.id,
        name: p.name,
        projectPath: p.projectPath,
        provider: p.provider,
        providerProjectDir: p.providerProjectDir,
        lastActivityAt: p.lastActivityAt,
        sessionCount: p.sessionCount,
        skillCount: p.skillCount,
        status: p.status,
        lastScannedAt: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: dbSchema.projects.id,
        set: {
          name: p.name,
          projectPath: p.projectPath,
          lastActivityAt: p.lastActivityAt,
          sessionCount: p.sessionCount,
          skillCount: p.skillCount,
          status: p.status,
          lastScannedAt: now,
        },
      })
      .run();
  }

  return listProjects();
}

export function listProjects(): Project[] {
  const rows = getDb()
    .select()
    .from(dbSchema.projects)
    .where(ne(dbSchema.projects.status, 'dismissed'))
    .all();

  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const rows = getDb()
    .select()
    .from(dbSchema.projects)
    .where(eq(dbSchema.projects.id, id))
    .all();

  return rows[0] ? rowToProject(rows[0]) : null;
}

export function dismissProject(id: string): void {
  getDb()
    .update(dbSchema.projects)
    .set({ status: 'dismissed' })
    .where(eq(dbSchema.projects.id, id))
    .run();
}

export function hasProjects(): boolean {
  const rows = getDb()
    .select({ id: dbSchema.projects.id })
    .from(dbSchema.projects)
    .where(ne(dbSchema.projects.status, 'dismissed'))
    .all();
  return rows.length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    projectPath: row.projectPath,
    provider: row.provider as Project['provider'],
    providerProjectDir: row.providerProjectDir,
    lastActivityAt: row.lastActivityAt,
    sessionCount: row.sessionCount,
    skillCount: row.skillCount,
    status: row.status as Project['status'],
    lastScannedAt: row.lastScannedAt,
    createdAt: row.createdAt,
  };
}
