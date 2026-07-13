import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { DriftReport } from '../drift-analyzer.js';
import { getDriftAdjudicationStorePath } from './hook-paths.js';
import type { DriftVerdict, TranscriptVerdict } from './verdict-parser.js';

const STORE_VERSION = 1;
const MAX_RECORDS = 500;
const READJUDICATE_AFTER_MESSAGES = 6;

export interface DriftAdjudicationRecord {
  key: string;
  provider: 'claude' | 'codex';
  sessionId: string;
  threadSignature: string;
  status: 'pending' | DriftVerdict;
  report: DriftReport;
  baselineVerdictMarker: string | null;
  transitions: number;
  userMessageCount: number;
  sustainedDepartureCount: number;
  updatedAt: number;
}

interface DriftAdjudicationFile {
  version: number;
  records: DriftAdjudicationRecord[];
}

function numericEvidence(report: DriftReport, key: string): number {
  const value = report.evidence[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function threadSignature(report: DriftReport): string {
  const clearBoundary = report.evidence['consideredAfterClearIdx'];
  return `${report.type}:${typeof clearBoundary === 'number' ? clearBoundary : 'root'}`;
}

function recordKey(provider: 'claude' | 'codex', sessionId: string): string {
  return `${provider}:${sessionId}`;
}

function readStore(path: string): DriftAdjudicationFile {
  if (!existsSync(path)) return { version: STORE_VERSION, records: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DriftAdjudicationFile>;
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.records)) {
      return { version: STORE_VERSION, records: [] };
    }
    return { version: STORE_VERSION, records: parsed.records.slice(-MAX_RECORDS) };
  } catch {
    return { version: STORE_VERSION, records: [] };
  }
}

function writeStore(path: string, store: DriftAdjudicationFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

function upsert(path: string, record: DriftAdjudicationRecord): DriftAdjudicationRecord {
  const store = readStore(path);
  const records = store.records.filter((item) => item.key !== record.key);
  records.push(record);
  writeStore(path, { version: STORE_VERSION, records: records.slice(-MAX_RECORDS) });
  return record;
}

export function getDriftAdjudication(
  provider: 'claude' | 'codex',
  sessionId: string,
  storePath = getDriftAdjudicationStorePath(),
): DriftAdjudicationRecord | null {
  const key = recordKey(provider, sessionId);
  return readStore(storePath).records.find((record) => record.key === key) ?? null;
}

export function beginDriftAdjudication(
  provider: 'claude' | 'codex',
  sessionId: string,
  report: DriftReport,
  previousVerdict: TranscriptVerdict | null,
  storePath = getDriftAdjudicationStorePath(),
): DriftAdjudicationRecord | null {
  const key = recordKey(provider, sessionId);
  const signature = threadSignature(report);
  const existing = getDriftAdjudication(provider, sessionId, storePath);
  const transitions = numericEvidence(report, 'transitionsDetected');
  const userMessageCount = numericEvidence(report, 'userMessageCount');
  const sustainedDepartureCount = numericEvidence(report, 'sustainedDepartureCount');

  if (existing?.threadSignature === signature) {
    if (existing.status === 'pending' || existing.status === 'drifting') return null;
    const materiallyChanged =
      transitions > existing.transitions ||
      sustainedDepartureCount >= (existing.sustainedDepartureCount ?? 0) + 2 ||
      userMessageCount - existing.userMessageCount >= READJUDICATE_AFTER_MESSAGES;
    if (!materiallyChanged) return null;
  }

  return upsert(storePath, {
    key,
    provider,
    sessionId,
    threadSignature: signature,
    status: 'pending',
    report,
    baselineVerdictMarker: previousVerdict?.marker ?? null,
    transitions,
    userMessageCount,
    sustainedDepartureCount,
    updatedAt: Date.now(),
  });
}

export function resolveDriftAdjudication(
  provider: 'claude' | 'codex',
  sessionId: string,
  transcriptVerdict: TranscriptVerdict | null,
  storePath = getDriftAdjudicationStorePath(),
): { verdict: DriftVerdict; report: DriftReport } | null {
  if (!transcriptVerdict) return null;
  const existing = getDriftAdjudication(provider, sessionId, storePath);
  if (!existing || existing.status !== 'pending') return null;
  if (existing.baselineVerdictMarker === transcriptVerdict.marker) return null;

  upsert(storePath, {
    ...existing,
    status: transcriptVerdict.verdict,
    updatedAt: Date.now(),
  });
  return { verdict: transcriptVerdict.verdict, report: existing.report };
}
