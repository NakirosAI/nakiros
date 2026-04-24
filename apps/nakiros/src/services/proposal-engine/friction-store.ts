import type { EnrichedFriction } from '@nakiros/shared';

import { blobToVector, getDb, vectorToBlob } from '../nakiros-db.js';

// ---------------------------------------------------------------------------
// Friction store — SQLite-backed. Frictions live in the central `embeddings`
// table with `entity_type = 'friction'`, sharing schema with the other
// semantic entities phase 2 will add (rules, skills, agents). The vector is
// stored as Float32Array bytes in a BLOB column — half the size of the JSON
// form and zero parse cost on read.
//
// Frictions are project-scoped: a proposal for project A has no business
// clustering with frictions from project B. Every read/write takes a
// projectId, with a catch-all helper for system-level queries only.
// ---------------------------------------------------------------------------

const ENTITY_TYPE = 'friction';
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

interface FrictionMetadata {
  category?: string;
  rawExcerpt: string;
  skillsDetected: string[];
}

interface EmbeddingRow {
  id: string;
  project_id: string;
  entity_ref: string; // conversationId
  text: string;       // friction.description
  vector: Buffer;
  created_at: number; // friction.timestamp
  metadata: string | null;
}

/**
 * Append (upsert) enriched frictions into the embeddings table.
 * Uses `INSERT OR REPLACE` so replaying the same analyzer event is idempotent
 * (same friction id → same row).
 */
export function appendFrictions(frictions: EnrichedFriction[]): void {
  if (frictions.length === 0) return;

  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO embeddings
     (id, entity_type, project_id, entity_ref, text, model, vector, created_at, metadata, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  );

  const tx = db.transaction((batch: EnrichedFriction[]) => {
    for (const f of batch) {
      const metadata: FrictionMetadata = {
        category: f.category,
        rawExcerpt: f.rawExcerpt,
        skillsDetected: f.skillsDetected,
      };
      stmt.run(
        f.id,
        ENTITY_TYPE,
        f.projectId,
        f.conversationId,
        f.description,
        EMBEDDING_MODEL,
        vectorToBlob(f.embedding),
        f.timestamp,
        JSON.stringify(metadata),
      );
    }
  });
  tx(frictions);
}

/**
 * Read every non-archived friction for the given project. Used by the
 * clustering pipeline, which expects the active set in memory for one pass.
 */
export function readActiveFrictionsForProject(projectId: string): EnrichedFriction[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, project_id, entity_ref, text, vector, created_at, metadata
       FROM embeddings
       WHERE entity_type = ? AND project_id = ? AND archived = 0
       ORDER BY created_at ASC`,
    )
    .all(ENTITY_TYPE, projectId) as EmbeddingRow[];
  return rows.map(rowToFriction);
}

/**
 * Return the distinct `project_id` values present in the active friction set.
 * Used by the engine at boot to re-run clustering across every project that
 * has data, not just the one that just emitted a new conversation.
 */
export function listProjectsWithActiveFrictions(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT project_id
       FROM embeddings
       WHERE entity_type = ? AND archived = 0 AND project_id IS NOT NULL`,
    )
    .all(ENTITY_TYPE) as { project_id: string }[];
  return rows.map((r) => r.project_id);
}

/**
 * In-memory filter kept for symmetry with the old API — callers occasionally
 * want to apply the active-window cut after a wider read.
 */
export function filterActive(
  frictions: EnrichedFriction[],
  cutoffMs: number,
): EnrichedFriction[] {
  return frictions.filter((f) => f.timestamp >= cutoffMs);
}

/**
 * Soft-archive frictions older than `cutoffMs`. We keep the rows around so
 * phase 2 can still cross-reference historical frictions when auditing
 * `.claude/` config — the clustering pipeline ignores archived rows.
 *
 * Archive runs across ALL projects in one pass since it's a pure timestamp
 * cut: no need to iterate projects.
 */
export function archiveOldFrictions(cutoffMs: number): { archived: number; kept: number } {
  const db = getDb();
  const archiveInfo = db
    .prepare(
      `UPDATE embeddings
       SET archived = 1
       WHERE entity_type = ? AND archived = 0 AND created_at < ?`,
    )
    .run(ENTITY_TYPE, cutoffMs);
  const remaining = db
    .prepare(
      `SELECT COUNT(*) as n FROM embeddings
       WHERE entity_type = ? AND archived = 0`,
    )
    .get(ENTITY_TYPE) as { n: number };

  return { archived: archiveInfo.changes, kept: remaining.n };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function rowToFriction(row: EmbeddingRow): EnrichedFriction {
  let metadata: FrictionMetadata;
  try {
    metadata = row.metadata
      ? (JSON.parse(row.metadata) as FrictionMetadata)
      : { rawExcerpt: '', skillsDetected: [] };
  } catch {
    metadata = { rawExcerpt: '', skillsDetected: [] };
  }
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.entity_ref,
    timestamp: row.created_at,
    description: row.text,
    category: metadata.category,
    rawExcerpt: metadata.rawExcerpt,
    skillsDetected: metadata.skillsDetected ?? [],
    embedding: blobToVector(row.vector),
  };
}
