import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

// ---------------------------------------------------------------------------
// Nakiros local database — a single SQLite file under ~/.nakiros/nakiros.db.
// Central store for anything that needs relational queries or cross-entity
// joins: friction embeddings today, rule/skill/agent embeddings + config
// scan history + permission events in phase 2.
//
// Per CLAUDE.md: ESM daemon, no `require()` — better-sqlite3 exposes its
// default export which we import normally. Schema migrations run lazily on
// first `getDb()` call and are idempotent.
// ---------------------------------------------------------------------------

const DB_PATH = join(homedir(), '.nakiros', 'nakiros.db');

let dbSingleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);

  dbSingleton = db;
  return db;
}

/**
 * Close the database handle — mostly useful for tests. Production leaves the
 * singleton open for the daemon's lifetime.
 */
export function closeDb(): void {
  if (!dbSingleton) return;
  dbSingleton.close();
  dbSingleton = null;
}

// ---------------------------------------------------------------------------
// Migrations
//
// Linear versioned migrations. `schema_version` stores the last applied
// number. Add new migrations by appending to MIGRATIONS below; never mutate
// a prior entry — that would cause drift on existing installs.
// ---------------------------------------------------------------------------

const MIGRATIONS: { version: number; up: string }[] = [
  {
    version: 1,
    up: `
      CREATE TABLE embeddings (
        id          TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_ref  TEXT NOT NULL,
        text        TEXT NOT NULL,
        model       TEXT NOT NULL,
        vector      BLOB NOT NULL,
        created_at  INTEGER NOT NULL,
        metadata    TEXT,
        archived    INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_emb_type_time ON embeddings(entity_type, created_at);
      CREATE INDEX idx_emb_ref ON embeddings(entity_type, entity_ref);
      CREATE INDEX idx_emb_active ON embeddings(entity_type, archived, created_at);
    `,
  },
  {
    version: 2,
    up: `
      -- Project scoping for frictions (and any future project-scoped entity).
      -- Existing rows default to NULL; the proposal engine skips NULL rows
      -- since clustering is per-project. Users re-analyze conversations to
      -- backfill correct project_id.
      ALTER TABLE embeddings ADD COLUMN project_id TEXT;
      CREATE INDEX idx_emb_project ON embeddings(entity_type, project_id, archived, created_at);
    `,
  },
];

function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;
  const current = row?.version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const run = db.transaction(() => {
      db.exec(migration.up);
      db.prepare('DELETE FROM schema_version').run();
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
        migration.version,
      );
    });
    run();
  }
}

// ---------------------------------------------------------------------------
// Vector <-> BLOB helpers
//
// Embeddings live on disk as Float32Array bytes (1536 bytes for 384 dims) —
// half the size of the JSON-stringified form, and reads avoid a JSON.parse
// on every query.
// ---------------------------------------------------------------------------

export function vectorToBlob(vec: number[]): Buffer {
  const arr = new Float32Array(vec);
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function blobToVector(blob: Buffer): number[] {
  const arr = new Float32Array(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return Array.from(arr);
}
