/**
 * Smoke test for `recommendation-cluster.ts`. Builds synthetic zones, runs
 * the clustering, and asserts the expected groupings. Run with:
 *   pnpm -F @nakirosai/nakiros exec tsx src/scripts/smoke-recommendation-cluster.ts
 */
import type { ConversationFrictionZone } from '@nakiros/shared';
import {
  extractZoneTokens,
  groupPatterns,
  scoreZones,
  wrapZone,
} from '../services/recommendation-cluster.js';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('OK:', message);
}

function makeZone(
  id: string,
  reactionSnippet: string,
  files: string[],
  severity: 'medium' | 'high' = 'medium',
  signalKinds: Array<'S4' | 'S5' | 'S6'> = [],
): ConversationFrictionZone {
  return {
    id,
    startTurn: 1,
    endTurn: 5,
    startTimestamp: '2026-05-13T10:00:00.000Z',
    endTimestamp: '2026-05-13T10:05:00.000Z',
    reactionPoint: {
      offsetPct: 0.8,
      timestamp: '2026-05-13T10:05:00.000Z',
      snippet: reactionSnippet,
      matchedPattern: `stuck-cluster:3:0.5`,
      precedingTool: null,
    },
    agentContext: {
      filesTouched: files,
      toolCallsCount: 4,
      toolErrorsCount: 0,
      backtrackedFiles: [],
      keyActions: [],
    },
    clusterSize: 3,
    severity,
    signalKinds,
  };
}

// ─── Test 1: token extraction drops stop words and short tokens ────────────

const z1 = makeZone('z1', 'le fichier auth.ts ne compile pas', ['src/auth.ts']);
const tokens = extractZoneTokens(z1);
assert(!tokens.has('le'), 'token extraction drops FR stop word "le"');
assert(!tokens.has('ne'), 'token extraction drops FR stop word "ne"');
assert(tokens.has('fichier'), 'token extraction keeps "fichier"');
assert(tokens.has('compile'), 'token extraction keeps "compile"');
assert(tokens.has('auth.ts') || tokens.has('auth'), 'token extraction includes file basename or token');

// ─── Test 2: scoreZones — same topic + same file → high score ──────────────

const a = wrapZone({ convoId: 'c1', zoneId: 'z1' }, makeZone('z1', 'i18n key missing in auth screen', ['src/auth.tsx']));
const b = wrapZone({ convoId: 'c2', zoneId: 'z2' }, makeZone('z2', 'i18n key missing in settings screen', ['src/auth.tsx']));
const ab = scoreZones(a, b);
assert(ab > 0.30, `scoreZones same topic+file > 0.30 (got ${ab.toFixed(2)})`);

// ─── Test 3: scoreZones — different topic, different files → low ──────────

const c = wrapZone({ convoId: 'c3', zoneId: 'z3' }, makeZone('z3', 'database migration failed', ['db/schema.sql']));
const ac = scoreZones(a, c);
assert(ac < 0.30, `scoreZones disjoint topics < 0.30 (got ${ac.toFixed(2)})`);

// ─── Test 4: groupPatterns — 3 zones same topic → 1 pattern ─────────────────

const zones = [
  wrapZone({ convoId: 'c1', zoneId: 'z1' }, makeZone('z1', 'i18n key missing translation', ['src/i18n.ts'])),
  wrapZone({ convoId: 'c2', zoneId: 'z2' }, makeZone('z2', 'i18n key missing translation again', ['src/i18n.ts'])),
  wrapZone({ convoId: 'c3', zoneId: 'z3' }, makeZone('z3', 'translation key missing for i18n', ['src/i18n.ts'])),
];
const patterns = groupPatterns('proj1', zones);
assert(patterns.length === 1, `3 similar zones cluster into 1 pattern (got ${patterns.length})`);
assert(patterns[0].zoneCount === 3, `pattern zoneCount === 3 (got ${patterns[0].zoneCount})`);
assert(patterns[0].id.length === 16, `patternId is 16-char sha1 prefix (got len ${patterns[0].id.length})`);

// ─── Test 5: groupPatterns — solo zone → no pattern (< 2) ───────────────────

const solo = [wrapZone({ convoId: 'c1', zoneId: 'z1' }, makeZone('z1', 'rare unique topic alone', ['x']))];
assert(groupPatterns('proj1', solo).length === 0, 'solo zone produces no pattern');

// ─── Test 6: synthetic interrupt zones are filtered out ─────────────────────

const synthetic = [
  wrapZone({ convoId: 'c1', zoneId: 'z1' }, makeZone('z1', '[Request interrupted by user for tool use]', [])),
  wrapZone({ convoId: 'c2', zoneId: 'z2' }, makeZone('z2', '[Request interrupted by user for tool use]', [])),
];
assert(groupPatterns('proj1', synthetic).length === 0, 'synthetic interrupt zones never form a pattern');

// ─── Test 7: patternId is stable across runs with same zones ────────────────

const p1 = groupPatterns('proj1', zones)[0];
const p2 = groupPatterns('proj1', zones)[0];
assert(p1.id === p2.id, 'patternId is stable across identical runs');

// ─── Test 8: severity bump when zoneCount >= 4 ──────────────────────────────

const fourSimilar = Array.from({ length: 4 }, (_, i) =>
  wrapZone({ convoId: `c${i}`, zoneId: `z${i}` }, makeZone(`z${i}`, 'i18n key missing translation again', ['src/i18n.ts'])),
);
const bumped = groupPatterns('proj1', fourSimilar)[0];
assert(bumped.severity === 'high', `4 medium zones bump severity to high (got ${bumped.severity})`);

console.log('\nAll cluster smoke assertions passed.');
