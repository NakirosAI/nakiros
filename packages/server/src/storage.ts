import { eq } from 'drizzle-orm';

import type { CollabSession, StoredWorkspace } from '@nakiros/shared';

import { getDb } from './db/index.js';
import * as schema from './db/schema.js';

export interface IStorage {
  readWorkspaces(): Promise<StoredWorkspace[]>;
  readWorkspace(id: string): Promise<StoredWorkspace | null>;
  writeWorkspace(workspace: StoredWorkspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  readCollabs(workspaceId: string): Promise<CollabSession[]>;
  readCollab(id: string): Promise<CollabSession | null>;
  writeCollab(collab: CollabSession): Promise<void>;
}

export class SQLiteStorage implements IStorage {
  async readWorkspaces(): Promise<StoredWorkspace[]> {
    const rows = getDb().select().from(schema.workspaces).all();
    return rows.map((r) => JSON.parse(r.data) as StoredWorkspace);
  }

  async readWorkspace(id: string): Promise<StoredWorkspace | null> {
    const rows = getDb().select().from(schema.workspaces).where(eq(schema.workspaces.id, id)).all();
    return rows[0] ? (JSON.parse(rows[0].data) as StoredWorkspace) : null;
  }

  async writeWorkspace(workspace: StoredWorkspace): Promise<void> {
    const now = new Date().toISOString();
    getDb()
      .insert(schema.workspaces)
      .values({ id: workspace.id, name: workspace.name, data: JSON.stringify(workspace), updatedAt: now })
      .onConflictDoUpdate({
        target: schema.workspaces.id,
        set: { name: workspace.name, data: JSON.stringify(workspace), updatedAt: now },
      })
      .run();
  }

  async deleteWorkspace(id: string): Promise<void> {
    getDb().delete(schema.workspaces).where(eq(schema.workspaces.id, id)).run();
  }

  async readCollabs(workspaceId: string): Promise<CollabSession[]> {
    const rows = getDb()
      .select()
      .from(schema.collabSessions)
      .where(eq(schema.collabSessions.workspaceId, workspaceId))
      .all();
    return rows.map((r) => JSON.parse(r.data) as CollabSession);
  }

  async readCollab(id: string): Promise<CollabSession | null> {
    const rows = getDb()
      .select()
      .from(schema.collabSessions)
      .where(eq(schema.collabSessions.id, id))
      .all();
    return rows[0] ? (JSON.parse(rows[0].data) as CollabSession) : null;
  }

  async writeCollab(collab: CollabSession): Promise<void> {
    getDb()
      .insert(schema.collabSessions)
      .values({
        id: collab.id,
        workspaceId: collab.workspaceId,
        topic: collab.topic,
        status: collab.status,
        data: JSON.stringify(collab),
        createdAt: collab.createdAt,
        resolvedAt: collab.resolvedAt ?? null,
      })
      .onConflictDoUpdate({
        target: schema.collabSessions.id,
        set: {
          status: collab.status,
          data: JSON.stringify(collab),
          resolvedAt: collab.resolvedAt ?? null,
        },
      })
      .run();
  }
}
