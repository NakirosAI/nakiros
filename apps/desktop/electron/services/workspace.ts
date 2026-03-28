import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import { eq } from 'drizzle-orm';

import { getDb, dbSchema } from '@nakiros/server';
import type { StoredWorkspace } from '@nakiros/shared';

export function toWorkspaceSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';
}

// ---------------------------------------------------------------------------
// One-time migration: ~/.nakiros/workspaces/{slug}/workspace.json → SQLite
// ---------------------------------------------------------------------------
let migrationDone = false;
function migrateIfNeeded(): void {
  if (migrationDone) return;
  migrationDone = true;

  const nakirosRoot = join(homedir(), '.nakiros', 'workspaces');
  if (!existsSync(nakirosRoot)) return;

  let entries: string[];
  try {
    entries = readdirSync(nakirosRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return;
  }

  const db = getDb();
  for (const slug of entries) {
    const jsonPath = join(nakirosRoot, slug, 'workspace.json');
    if (!existsSync(jsonPath)) continue;
    try {
      const ws = JSON.parse(readFileSync(jsonPath, 'utf-8')) as StoredWorkspace;
      const existing = db.select().from(dbSchema.workspaces).where(eq(dbSchema.workspaces.id, ws.id)).all();
      if (existing.length === 0) {
        db.insert(dbSchema.workspaces)
          .values({ id: ws.id, name: ws.name, data: JSON.stringify(ws), updatedAt: new Date().toISOString() })
          .run();
        console.log(`[Nakiros] Migrated workspace "${ws.name}" (${ws.id}) to SQLite`);
      }
      renameSync(jsonPath, `${jsonPath}.migrated`);
    } catch (err) {
      console.error(`[Nakiros] Failed to migrate workspace from ${jsonPath}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — synchronous (better-sqlite3 is sync)
// ---------------------------------------------------------------------------

export function getAll(): StoredWorkspace[] {
  migrateIfNeeded();
  const rows = getDb().select().from(dbSchema.workspaces).all();
  return rows.map((row: { data: string }) => JSON.parse(row.data) as StoredWorkspace);
}

export function save(workspace: StoredWorkspace): void {
  migrateIfNeeded();
  const now = new Date().toISOString();
  getDb()
    .insert(dbSchema.workspaces)
    .values({ id: workspace.id, name: workspace.name, data: JSON.stringify(workspace), updatedAt: now })
    .onConflictDoUpdate({
      target: dbSchema.workspaces.id,
      set: { name: workspace.name, data: JSON.stringify(workspace), updatedAt: now },
    })
    .run();
}

export function replaceAll(workspaces: StoredWorkspace[]): void {
  migrateIfNeeded();
  const db = getDb();
  const now = new Date().toISOString();
  const incomingIds = new Set(workspaces.map((workspace) => workspace.id));
  const existingRows = db.select({ id: dbSchema.workspaces.id }).from(dbSchema.workspaces).all();

  for (const row of existingRows) {
    if (!incomingIds.has(row.id)) {
      db.delete(dbSchema.workspaces).where(eq(dbSchema.workspaces.id, row.id)).run();
    }
  }

  for (const workspace of workspaces) {
    db
      .insert(dbSchema.workspaces)
      .values({ id: workspace.id, name: workspace.name, data: JSON.stringify(workspace), updatedAt: now })
      .onConflictDoUpdate({
        target: dbSchema.workspaces.id,
        set: { name: workspace.name, data: JSON.stringify(workspace), updatedAt: now },
      })
      .run();
  }
}

export function remove(id: string): void {
  getDb().delete(dbSchema.workspaces).where(eq(dbSchema.workspaces.id, id)).run();
}

// Kept for compatibility with workspace-yaml.ts and other callers
export function resolveWorkspaceSlug(_id: string, name: string): string {
  return toWorkspaceSlug(name);
}

export function ensureNakirosDirs(): void {
  mkdirSync(join(homedir(), '.nakiros', 'workspaces'), { recursive: true });
}

export function getNakirosWorkspaceDir(workspaceSlug: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug);
}
