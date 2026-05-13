/**
 * Filesystem store for recommendations. Persists patterns + reco cards under
 * `~/.nakiros/recommendations/<projectId>/`. Atomic writes only — concurrent
 * readers always see a coherent JSON file.
 *
 * Layout:
 *   patterns.json                        — list of RecommendationPattern
 *   <patternId>/recos/<recId>.md         — raw markdown body (frontmatter included)
 *   <patternId>/recos/<recId>.json       — sidecar with status/appliedRunId
 *   <patternId>/meta.json                — analyser run meta (status, runId, recoCount)
 *   archive/<patternId>/...               — recos for vanished patternIds (kept)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

import type { RecommendationPattern, RecoCard } from '@nakiros/shared';

// TEMP — wired in Task 8.
function parseRecoCardFromDisk(_md: string, _sidecar: RecoSidecar): RecoCard | null {
  throw new Error('parseRecoCardFromDisk is wired in Task 8 — do not call before then');
}

/** Cache version stored in `patterns.json`. Increment on schema changes. */
export const PATTERNS_CACHE_VERSION = 1;

interface PatternsFile {
  version: number;
  projectId: string;
  generatedAt: string;
  patterns: RecommendationPattern[];
}

interface RecoSidecar {
  recId: string;
  patternId: string;
  status: RecoCard['status'];
  appliedRunId?: string;
  createdAt: string;
  editedAt?: string;
}

// ─── Path helpers ───────────────────────────────────────────────────────────

/** Absolute path to the per-project recommendations directory. */
export function projectDir(projectId: string): string {
  return join(homedir(), '.nakiros', 'recommendations', projectId);
}

function patternsPath(projectId: string): string {
  return join(projectDir(projectId), 'patterns.json');
}

function patternDir(projectId: string, patternId: string): string {
  return join(projectDir(projectId), patternId);
}

function recosDir(projectId: string, patternId: string): string {
  return join(patternDir(projectId, patternId), 'recos');
}

function recoMdPath(projectId: string, patternId: string, recId: string): string {
  return join(recosDir(projectId, patternId), `${recId}.md`);
}

function recoSidecarPath(projectId: string, patternId: string, recId: string): string {
  return join(recosDir(projectId, patternId), `${recId}.json`);
}

// ─── Low-level I/O ──────────────────────────────────────────────────────────

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

/**
 * Write `content` to `p` atomically using a tmp-file + rename so concurrent
 * readers always see a complete file.
 */
function writeAtomic(p: string, content: string): void {
  ensureDir(dirname(p));
  const tmp = `${p}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, p);
}

// ─── Patterns ──────────────────────────────────────────────────────────────

/**
 * Return the cached patterns list for `projectId`, or `null` when the file
 * does not exist or carries an incompatible cache version.
 */
export function readPatterns(projectId: string): RecommendationPattern[] | null {
  const p = patternsPath(projectId);
  if (!existsSync(p)) return null;
  try {
    const blob = JSON.parse(readFileSync(p, 'utf8')) as PatternsFile;
    if (blob.version !== PATTERNS_CACHE_VERSION) return null;
    return blob.patterns;
  } catch {
    return null;
  }
}

/**
 * Replace the patterns file atomically with the new `patterns` list.
 *
 * Patterns whose ids are absent from the new list are **not** deleted — their
 * reco directories are moved into `archive/<oldPatternId>/` so that historical
 * cards are preserved.
 */
export function writePatterns(projectId: string, patterns: RecommendationPattern[]): void {
  const old = readPatterns(projectId) ?? [];
  const newIds = new Set(patterns.map((p) => p.id));
  for (const o of old) {
    if (!newIds.has(o.id)) archivePattern(projectId, o.id);
  }
  const file: PatternsFile = {
    version: PATTERNS_CACHE_VERSION,
    projectId,
    generatedAt: new Date().toISOString(),
    patterns,
  };
  writeAtomic(patternsPath(projectId), JSON.stringify(file, null, 2));
}

/**
 * Move a pattern's directory into `archive/<patternId>/`. Idempotent — returns
 * silently when the source is missing or the destination already exists.
 */
function archivePattern(projectId: string, patternId: string): void {
  const src = patternDir(projectId, patternId);
  if (!existsSync(src)) return;
  const dest = join(projectDir(projectId), 'archive', patternId);
  ensureDir(dirname(dest));
  if (existsSync(dest)) return;
  try {
    renameSync(src, dest);
  } catch (err) {
    console.warn(`[recommendation-store] Failed to archive pattern ${patternId}: ${(err as Error).message}`);
  }
}

/**
 * Patch the `analysis` block of a single pattern in `patterns.json` without
 * touching any other field. No-ops when the pattern or the file is missing.
 */
export function updatePatternAnalysis(
  projectId: string,
  patternId: string,
  patch: Partial<RecommendationPattern['analysis']>,
): void {
  const current = readPatterns(projectId);
  if (!current) return;
  const idx = current.findIndex((p) => p.id === patternId);
  if (idx === -1) return;
  current[idx] = {
    ...current[idx],
    analysis: { ...current[idx].analysis, ...patch },
  };
  writePatterns(projectId, current);
}

// ─── Recos ─────────────────────────────────────────────────────────────────

/**
 * Persist a single reco card produced by the analyser. Writes both the
 * markdown body (`<recId>.md`) and the sidecar (`<recId>.json`) atomically.
 */
export function writeRecoCard(projectId: string, card: RecoCard): void {
  writeAtomic(recoMdPath(projectId, card.patternId, card.recId), card.body);
  const sidecar: RecoSidecar = {
    recId: card.recId,
    patternId: card.patternId,
    status: card.status,
    appliedRunId: card.appliedRunId,
    createdAt: card.createdAt,
    editedAt: card.editedAt,
  };
  writeAtomic(recoSidecarPath(projectId, card.patternId, card.recId), JSON.stringify(sidecar, null, 2));
}

/**
 * List all reco cards persisted for `patternId`, sorted by `createdAt` asc.
 * Returns `[]` when the recos directory does not exist.
 */
export function listRecoCards(projectId: string, patternId: string): RecoCard[] {
  const dir = recosDir(projectId, patternId);
  if (!existsSync(dir)) return [];
  const cards: RecoCard[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const recId = entry.replace(/\.md$/, '');
    const card = readRecoCard(projectId, patternId, recId);
    if (card) cards.push(card);
  }
  return cards.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Read a single reco card by joining the markdown body and the sidecar.
 * Returns `null` when either file is missing or cannot be parsed.
 */
export function readRecoCard(projectId: string, patternId: string, recId: string): RecoCard | null {
  const mdPath = recoMdPath(projectId, patternId, recId);
  const sidecarPath = recoSidecarPath(projectId, patternId, recId);
  if (!existsSync(mdPath) || !existsSync(sidecarPath)) return null;
  let md: string, sidecar: RecoSidecar;
  try {
    md = readFileSync(mdPath, 'utf8');
    sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8')) as RecoSidecar;
  } catch {
    return null;
  }
  return parseRecoCardFromDisk(md, sidecar);
}

/**
 * Mutate a reco's sidecar to reflect a status change (apply / dismiss /
 * un-apply). No-ops when the sidecar does not exist.
 */
export function updateRecoStatus(
  projectId: string,
  patternId: string,
  recId: string,
  patch: Partial<Pick<RecoCard, 'status' | 'appliedRunId' | 'editedAt'>>,
): void {
  const sidecarPath = recoSidecarPath(projectId, patternId, recId);
  if (!existsSync(sidecarPath)) return;
  const current = JSON.parse(readFileSync(sidecarPath, 'utf8')) as RecoSidecar;
  const next: RecoSidecar = { ...current, ...patch };
  writeAtomic(sidecarPath, JSON.stringify(next, null, 2));
}

/**
 * Overwrite the markdown body of a reco card and stamp `editedAt`. Used when
 * the user edits the brief inline before applying. No-ops when the `.md` file
 * does not exist.
 */
export function writeRecoBody(projectId: string, patternId: string, recId: string, body: string): void {
  const mdPath = recoMdPath(projectId, patternId, recId);
  if (!existsSync(mdPath)) return;
  writeAtomic(mdPath, body);
  updateRecoStatus(projectId, patternId, recId, { editedAt: new Date().toISOString() });
}
