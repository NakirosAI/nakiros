import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import type { StoredWorkspace } from '@nakiros/shared';

import * as schema from './schema.js';

function getDataPath(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Nakiros');
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? homedir(), 'Nakiros');
  return join(homedir(), '.config', 'Nakiros');
}

const DATA_PATH = getDataPath();
const DB_PATH = join(DATA_PATH, 'nakiros.db');
const LEGACY_JSON_PATH = join(DATA_PATH, 'workspaces.json');

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDb | null = null;

export function getDb(): DrizzleDb {
  if (_db) return _db;

  mkdirSync(DATA_PATH, { recursive: true });

  const sqlite = new Database(DB_PATH);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS collab_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
  `);

  // Migrate from legacy workspaces.json if DB is empty
  const count = (sqlite.prepare('SELECT COUNT(*) as n FROM workspaces').get() as { n: number }).n;
  if (count === 0 && existsSync(LEGACY_JSON_PATH)) {
    try {
      const legacyData = JSON.parse(readFileSync(LEGACY_JSON_PATH, 'utf-8')) as StoredWorkspace[];
      const insert = sqlite.prepare(
        'INSERT OR IGNORE INTO workspaces (id, name, data, updated_at) VALUES (?, ?, ?, ?)'
      );
      const migrate = sqlite.transaction(() => {
        for (const ws of legacyData) {
          insert.run(ws.id, ws.name, JSON.stringify(ws), new Date().toISOString());
        }
      });
      migrate();
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {
      // Silent — migration failure is not critical
    }
  }

  _db = drizzle(sqlite, { schema });

  return _db;
}
