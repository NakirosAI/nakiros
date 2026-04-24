import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import type { Proposal, ProposalStatus } from '@nakiros/shared';

import { cosineSim } from './clustering.js';

// ---------------------------------------------------------------------------
// Proposal persistence — one JSON file per proposal under
// ~/.nakiros/proposals/. Rejected cluster signatures are kept in a sidecar
// file keyed by cluster centroid so semantically-equivalent clusters don't
// re-surface the same proposal after the user has already dismissed it.
// ---------------------------------------------------------------------------

const PROPOSALS_DIR = join(homedir(), '.nakiros', 'proposals');
const REJECTED_PATH = join(PROPOSALS_DIR, 'rejected.json');

// A new cluster whose centroid is above this similarity to a previously
// rejected one is considered "the same pain point" and gets skipped.
const REJECTION_MATCH_THRESHOLD = 0.85;

interface RejectionRecord {
  clusterId: string;
  centroid: number[];
  rejectedAt: number;
  reason?: string;
}

interface RejectionsFile {
  records: RejectionRecord[];
}

function ensureDir(): void {
  if (!existsSync(PROPOSALS_DIR)) mkdirSync(PROPOSALS_DIR, { recursive: true });
}

function proposalPath(id: string): string {
  return join(PROPOSALS_DIR, `${id}.json`);
}

export function saveProposal(proposal: Proposal): void {
  ensureDir();
  writeFileSync(proposalPath(proposal.id), JSON.stringify(proposal, null, 2), 'utf8');
}

export function loadProposal(id: string): Proposal | null {
  const path = proposalPath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Proposal;
  } catch {
    return null;
  }
}

export interface ListProposalsFilter {
  /** When provided, drop proposals from other projects. */
  projectId?: string;
  status?: ProposalStatus;
}

export function listProposals(filter: ListProposalsFilter = {}): Proposal[] {
  if (!existsSync(PROPOSALS_DIR)) return [];
  const files = readdirSync(PROPOSALS_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'rejected.json',
  );
  const out: Proposal[] = [];
  for (const file of files) {
    try {
      const p = JSON.parse(readFileSync(join(PROPOSALS_DIR, file), 'utf8')) as Proposal;
      if (filter.projectId && p.projectId !== filter.projectId) continue;
      if (filter.status && p.status !== filter.status) continue;
      out.push(p);
    } catch {
      /* skip malformed */
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export function updateProposalStatus(
  id: string,
  status: ProposalStatus,
  patch?: Partial<Proposal>,
): Proposal | null {
  const current = loadProposal(id);
  if (!current) return null;
  const updated: Proposal = {
    ...current,
    ...patch,
    status,
    updatedAt: Date.now(),
  };
  saveProposal(updated);
  return updated;
}

// ─── Rejected cluster tracking ─────────────────────────────────────────────

function readRejections(): RejectionsFile {
  if (!existsSync(REJECTED_PATH)) return { records: [] };
  try {
    return JSON.parse(readFileSync(REJECTED_PATH, 'utf8')) as RejectionsFile;
  } catch {
    return { records: [] };
  }
}

function writeRejections(data: RejectionsFile): void {
  ensureDir();
  writeFileSync(REJECTED_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function markClusterRejected(
  clusterId: string,
  centroid: number[],
  reason?: string,
): void {
  const current = readRejections();
  current.records.push({ clusterId, centroid, rejectedAt: Date.now(), reason });
  writeRejections(current);
}

/**
 * True when the given cluster centroid matches a previously-rejected one
 * above the similarity threshold. Exact-id match short-circuits the scan.
 */
export function isClusterRejected(clusterId: string, centroid: number[]): boolean {
  const { records } = readRejections();
  for (const record of records) {
    if (record.clusterId === clusterId) return true;
    if (
      record.centroid.length === centroid.length &&
      cosineSim(record.centroid, centroid) >= REJECTION_MATCH_THRESHOLD
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when an in-flight (draft or eval_*) proposal already exists for this
 * cluster id. Prevents duplicate generation on every analyzer event.
 */
export function hasActiveProposalForCluster(clusterId: string): boolean {
  const proposals = listProposals();
  return proposals.some(
    (p) =>
      p.clusterId === clusterId &&
      (p.status === 'draft' ||
        p.status === 'eval_running' ||
        p.status === 'eval_done' ||
        p.status === 'accepted'),
  );
}

/** Dev helper — unused in runtime paths, exported so tests can reset state. */
export function deleteProposal(id: string): void {
  const path = proposalPath(id);
  if (existsSync(path)) unlinkSync(path);
}
