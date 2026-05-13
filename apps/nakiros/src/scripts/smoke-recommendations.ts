/**
 * Smoke for the recommendations store layer.
 *
 * This script does NOT spawn a real Claude Code agent. It exercises:
 *   1. Clustering via writePatterns / readPatterns round-trip.
 *   2. Reco card round-trip via writeRecoCard / listRecoCards / parseRecoCardFromDisk.
 *   3. Status transitions via updateRecoStatus.
 *   4. Archive on disappearing patternId via writePatterns.
 *
 * Run with:
 *   pnpm -F @nakirosai/nakiros exec tsx src/scripts/smoke-recommendations.ts
 */
import { rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import {
  listRecoCards,
  readPatterns,
  updateRecoStatus,
  writePatterns,
  writeRecoCard,
} from '../services/recommendation-store.js';
import type { RecommendationPattern, RecoCard } from '@nakiros/shared';

const PROJECT_ID = '__smoke_recommendations__';

function assert(c: unknown, m: string): asserts c {
  if (!c) { console.error('FAIL:', m); process.exit(1); }
  console.log('OK:', m);
}

function reset() {
  const root = join(homedir(), '.nakiros', 'recommendations', PROJECT_ID);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}

reset();

// ─── Round-trip patterns ───────────────────────────────────────────────────

const patternA: RecommendationPattern = {
  id: 'pat-aaa',
  projectId: PROJECT_ID,
  zoneRefs: [{ convoId: 'c1', zoneId: 'z1' }, { convoId: 'c2', zoneId: 'z2' }],
  signature: {
    topTokens: ['i18n', 'translation'],
    filesTouched: ['src/i18n.ts'],
    signalKinds: ['S4'],
    firstSeen: '2026-05-13T10:00:00.000Z',
    lastSeen: '2026-05-13T11:00:00.000Z',
  },
  zoneCount: 2,
  severity: 'medium',
  analysis: { status: 'idle' },
};

writePatterns(PROJECT_ID, [patternA]);
const readBack = readPatterns(PROJECT_ID);
assert(readBack?.length === 1, 'patterns.json round-trip');
assert(readBack?.[0].id === 'pat-aaa', 'pattern id preserved');

// ─── Round-trip reco card ──────────────────────────────────────────────────

const validMd = `---
recId: fix-i18n
patternId: pat-aaa
action: fix
artifactType: rules
target: i18n
title: Tighten i18n
evidence:
  zoneRefs: [{convoId: c1, zoneId: z1}]
  files: [src/i18n.ts]
---

# Tighten i18n

## Why
Multiple zones converge on i18n key issues.

## Brief
Adjust the i18n rule glob to cover apps/frontend/src/**/*.tsx and the bundles.

## Acceptance criteria
- glob covers tsx
- description updated
`;

const card: RecoCard = {
  recId: 'fix-i18n',
  patternId: 'pat-aaa',
  action: 'fix',
  artifactType: 'rules',
  target: 'i18n',
  title: 'Tighten i18n',
  body: validMd,
  brief: 'Adjust the i18n rule glob to cover apps/frontend/src/**/*.tsx and the bundles.',
  evidence: { zoneRefs: [{ convoId: 'c1', zoneId: 'z1' }], files: ['src/i18n.ts'] },
  status: 'pending',
  createdAt: '2026-05-13T12:00:00.000Z',
};

writeRecoCard(PROJECT_ID, card);
const list = listRecoCards(PROJECT_ID, 'pat-aaa');
assert(list.length === 1, 'one reco listed');
assert(list[0].action === 'fix', 'action round-tripped');
assert(list[0].brief.includes('glob'), 'brief round-tripped');

// ─── Status transitions ────────────────────────────────────────────────────

updateRecoStatus(PROJECT_ID, 'pat-aaa', 'fix-i18n', { status: 'applied', appliedRunId: 'run-1' });
const afterApply = listRecoCards(PROJECT_ID, 'pat-aaa')[0];
assert(afterApply.status === 'applied', 'status flipped to applied');
assert(afterApply.appliedRunId === 'run-1', 'appliedRunId persisted');

updateRecoStatus(PROJECT_ID, 'pat-aaa', 'fix-i18n', { status: 'dismissed' });
const afterDismiss = listRecoCards(PROJECT_ID, 'pat-aaa')[0];
assert(afterDismiss.status === 'dismissed', 'status flipped to dismissed');

// ─── Archive on disappearing patternId ─────────────────────────────────────

writePatterns(PROJECT_ID, []);
const archive = join(homedir(), '.nakiros', 'recommendations', PROJECT_ID, 'archive', 'pat-aaa');
assert(existsSync(archive), 'old patternId archived to archive/<patternId>/');
assert(readdirSync(join(archive, 'recos')).length > 0, 'archived recos preserved');

reset();
console.log('\nAll handler-layer smoke assertions passed.');
