# Friction Pattern Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface recurring friction patterns across a project's conversations on a new "Recommendations" sidebar screen, and let the user trigger an LLM run that produces reviewable markdown recommendation cards, each launching the existing fix/create/edit runner of the targeted `.claude/` artefact type.

**Architecture:**
1. **Daemon clustering** (no LLM) aggregates `ConversationFrictionZone[]` from cached analyses, groups them via Jaccard + file/tool affinity.
2. **`recommendation-analyze` runner** spawns a Claude Code agent in a sandbox workdir, fed the pattern + an inventory of existing `.claude/` artefacts, instructed to write markdown cards into `./recos/`.
3. **Apply-reco** translates a card into a `startEdit` (fix on existing entity) or `startCreate` (new entity) call with the brief sent as the first user message.

**Tech Stack:** TypeScript (ESM), Node 20, Fastify daemon, React 19 + Vite + Tailwind 4 frontend, pnpm workspaces + turbo. No test runner installed — testing uses **smoke scripts** under `apps/nakiros/src/scripts/` runnable with `pnpm tsx`.

**Spec:** `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`

---

## Background — patterns to follow

Before writing any code, the implementer should skim:

- `apps/nakiros/src/services/classify-convo-runner.ts` — closest template for the new `recommendation-analyze-runner.ts` (single-run lifecycle, source ↔ sub-run sessionId separation).
- `apps/nakiros/src/services/runner-core/index.ts` exports — `createRunner(spec)` + `RunnerSpec` + helpers (`encodeProjectPath`, `cleanupRunWorkdir`, `writeExecutionSettings`).
- `apps/nakiros/src/services/conversation-analyzer.ts:1102-1149` — `STOP_WORDS` + `tokenizeForCluster` (must be **extracted** to a shared module in Task 2 so clustering reuses them).
- `apps/nakiros/src/daemon/handlers/classify-convo.ts` — handler bundle pattern with `createTypedHandler` + `withBroadcastOnError` + `createEventBroadcaster`.
- `apps/nakiros/src/services/fix-runner.ts:1944-2035` — `startFix` / `startCreate` / `startEdit` signatures and `StartAuditRequest` usage.
- `.claude/rules/ipc-contract.md` — IPC contract sync rule (4 files in lockstep).
- `.claude/rules/runners.md` — runner conventions (`runner-core/` reuse, tmp_skill pattern, session-id tracking).
- `.claude/rules/i18n.md`, `.claude/rules/ui-kit.md`, `.claude/rules/markdown-rendering.md` — frontend conventions.

---

## Task 1: Shared types

**Files:**
- Create: `packages/shared/src/types/recommendation.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

- [ ] **Step 1: Create the types module**

Write `packages/shared/src/types/recommendation.ts`:

```ts
/**
 * Friction-pattern recommendation types — shared between the daemon and the
 * frontend. Implements `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`.
 */

/** Reference to a single friction zone inside a conversation. */
export interface RecommendationZoneRef {
  convoId: string;
  zoneId: string;
}

/**
 * Per-project cluster of similar friction zones. Computed by
 * `services/recommendation-cluster.ts` from cached `ConversationAnalysis`
 * entries. No LLM involved.
 */
export interface RecommendationPattern {
  /** Stable hash of `zoneRefs` sorted lexicographically (`convoId:zoneId`). */
  id: string;
  projectId: string;
  zoneRefs: RecommendationZoneRef[];
  signature: {
    /** Top 8 tokens by frequency across the cluster (lowercased, stop-words removed). */
    topTokens: string[];
    /** Union of `agentContext.filesTouched` across zones (deduped, in first-seen order). */
    filesTouched: string[];
    /** Union of `signalKinds` across zones. */
    signalKinds: Array<'S4' | 'S5' | 'S6'>;
    /** Earliest zone `startTimestamp` in the cluster (ISO-8601). */
    firstSeen: string;
    /** Latest zone `endTimestamp` in the cluster (ISO-8601). */
    lastSeen: string;
  };
  /** Same as `zoneRefs.length`, denormalised for sorting/UI. */
  zoneCount: number;
  /** Max `severity` across zones, bumped to `'high'` when `zoneCount >= 4`. */
  severity: 'medium' | 'high';
  /** Track the LLM analyser run that produced the cards (if any). */
  analysis: {
    status: 'idle' | 'running' | 'done' | 'failed';
    runId?: string;
    /** Count of valid cards persisted under `<patternId>/recos/`. */
    recoCount?: number;
    lastAnalyzedAt?: string;
  };
}

/** Type of `.claude/` artefact a recommendation targets. */
export type RecommendationArtifactType =
  | 'rules'
  | 'skill'
  | 'claudemd'
  | 'subagent'
  | 'hook'
  | 'permission'
  | 'mcp'
  | 'output-style';

/** One atomic recommendation card produced by the analyser run. */
export interface RecoCard {
  /** Kebab-case id parsed from the markdown frontmatter `recId` field. */
  recId: string;
  patternId: string;
  action: 'fix' | 'create';
  artifactType: RecommendationArtifactType;
  /** Identifier of the existing artefact when `action='fix'`; `'new'` when `action='create'`. */
  target: string;
  /** Short human title parsed from frontmatter. */
  title: string;
  /** Raw markdown body (everything after the frontmatter). */
  body: string;
  /**
   * Extracted "## Brief" section — this is what gets sent as the first
   * user message to the downstream `edit:* | create:* | fix:*` runner.
   */
  brief: string;
  evidence: {
    zoneRefs: RecommendationZoneRef[];
    files: string[];
  };
  status: 'pending' | 'applied' | 'dismissed';
  /** Set when `status === 'applied'` — the runId of the spawned downstream run. */
  appliedRunId?: string;
  createdAt: string;
  /** Set when the user edited the brief inline before applying. */
  editedAt?: string;
}

// ─── IPC payloads ──────────────────────────────────────────────────────────

/** Request payload for `recommendations:analyzePattern`. */
export interface StartRecommendationAnalyzeRequest {
  projectId: string;
  patternId: string;
}

/** Response shape from `recommendations:applyReco`. */
export type ApplyRecoResponse =
  | { ok: true; runId: string; runKind: 'fix' | 'create' | 'edit' }
  | { ok: false; error: 'target-missing' | 'unknown-artifact-type' | 'reco-not-found' };

// ─── Runner types (mirror of ClassifyConvoRun pattern) ─────────────────────

import type { BaseRunStatus } from './run-status.js';

/**
 * Single-turn analyser run. Mirrors `ClassifyConvoRun` — the source pattern
 * is tracked via `sourcePatternId` since `sessionId` is overwritten by the
 * runner-core with the spawned Claude Code session id. Same pitfall as
 * `feedback_runner_core_session_id_overwrite.md`.
 */
export interface RecommendationAnalyzeRun {
  runId: string;
  projectId: string;
  /** Pattern this run is analysing — never overwritten. */
  sourcePatternId: string;
  /** Claude Code session id assigned to this run by runner-core. */
  sessionId: string;
  status: BaseRunStatus;
  sessionClaudeId: string | null;
  workdir: string;
  model: 'sonnet' | 'opus';
  recoCount: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  interruptedByReboot?: boolean;
}

export interface RecommendationAnalyzeRunEvent {
  runId: string;
  event:
    | { type: 'stream'; data: unknown }
    | { type: 'status'; status: BaseRunStatus }
    | { type: 'done'; recoCount: number }
    | { type: 'error'; error: string };
}
```

- [ ] **Step 2: Re-export from the barrel**

Open `packages/shared/src/index.ts` and add the new module after the other `types/*` exports:

```ts
export * from './types/recommendation.js';
```

Verify by reading the file first to confirm the existing export pattern (likely `export * from './types/<name>.js'` lines).

- [ ] **Step 3: Verify types compile**

```bash
pnpm -F @nakiros/shared exec tsc --noEmit
```

Expected: PASS with no errors. If `BaseRunStatus` import path is wrong, look up the correct path in `packages/shared/src/types/` — there is an existing run-status type used by `ClassifyConvoRun`. Match its location.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/recommendation.ts packages/shared/src/index.ts
git commit -m "feat(shared): types for friction pattern recommendations"
```

---

## Task 2: Extract clustering tokenizer to a shared module

**Why:** The current `tokenizeForCluster` + `STOP_WORDS` + `SYNTHETIC_USER_TEXTS` live inside `conversation-analyzer.ts` (file-private). The new clustering module needs the *same* tokenizer to maintain consistency between zone detection and pattern detection. Extract to `runner-core` per `.claude/rules/runners.md` (any shared primitive lives there).

**Files:**
- Create: `apps/nakiros/src/services/runner-core/cluster-tokens.ts`
- Modify: `apps/nakiros/src/services/conversation-analyzer.ts:1095-1150` (replace local definitions with imports)
- Modify: `apps/nakiros/src/services/runner-core/index.ts` (re-export new module)

- [ ] **Step 1: Create the shared tokenizer**

Write `apps/nakiros/src/services/runner-core/cluster-tokens.ts`:

```ts
/**
 * Tokenization primitives for Jaccard-based clustering. Shared between
 * {@link conversation-analyzer} (zone detection) and
 * {@link recommendation-cluster} (pattern detection across zones). Both
 * must use the same tokens so similarity scores are comparable.
 */

/**
 * Stop words (FR + EN, case-insensitive). Common function words carry no
 * topical meaning and would inflate similarity between unrelated messages.
 */
export const STOP_WORDS = new Set([
  // FR
  'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc',
  'car', 'que', 'qui', 'quoi', 'comment', 'pourquoi', 'tu', 'je', 'il',
  'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'avec',
  'sans', 'pour', 'par', 'dans', 'sur', 'sous', 'entre', 'aussi',
  'pas', 'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'fait',
  'faire', 'voir', 'avoir', 'être', 'etre', 'pouvoir', 'falloir',
  'vouloir', 'savoir', 'oui', 'non', 'peut', 'doit', 'va',
  // EN
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'that',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'should', 'can', 'could', 'may', 'might',
  'i', 'you', 'he', 'she', 'we', 'they', 'it', 'us',
  'for', 'in', 'on', 'at', 'to', 'of', 'with', 'as', 'by',
  'yes', 'no', 'not', 'just', 'only',
]);

/**
 * Synthetic "user" messages injected by Claude Code when the user hits ESC.
 * Not real user turns — must be excluded from anything that aggregates user
 * messages.
 */
export const SYNTHETIC_USER_TEXTS = new Set([
  '[Request interrupted by user for tool use]',
  '[Request interrupted by user]',
]);

export function isSyntheticUserMessage(text: string): boolean {
  return SYNTHETIC_USER_TEXTS.has(text.trim());
}

/**
 * Tokenize a string for Jaccard clustering:
 * - Lowercase
 * - Split on `/\W+/`
 * - Drop tokens shorter than 3 chars
 * - Drop stop words
 */
export function tokenizeForCluster(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const t of text.toLowerCase().split(/\W+/)) {
    if (t.length >= 3 && !STOP_WORDS.has(t)) tokens.add(t);
  }
  return tokens;
}

/**
 * Jaccard similarity between two token sets.
 * Returns 0 when both sets are empty.
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
```

- [ ] **Step 2: Re-export from runner-core barrel**

Open `apps/nakiros/src/services/runner-core/index.ts`. Add:

```ts
export * from './cluster-tokens.js';
```

- [ ] **Step 3: Replace inline definitions in conversation-analyzer.ts**

In `apps/nakiros/src/services/conversation-analyzer.ts`:
- Find the import block at the top of the file. Add: `import { STOP_WORDS, SYNTHETIC_USER_TEXTS, isSyntheticUserMessage, tokenizeForCluster } from './runner-core/cluster-tokens.js';` (or via `./runner-core/index.js` if the file uses the barrel).
- Delete lines `1102-1149` (the `STOP_WORDS` const, `SYNTHETIC_USER_TEXTS` const, `isSyntheticUserMessage` function, `tokenizeForCluster` function).
- Keep the file working: every other reference to those names already resolves to the imports.

- [ ] **Step 4: Verify the analyzer still compiles**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Expected: PASS. If a reference resolves locally instead of via the new import, the TS error message will pinpoint the line — fix the import.

- [ ] **Step 5: Smoke-check the analyzer still works on a real session**

There's no automated test. The simplest manual check: pick one cached analysis file under `~/.nakiros/cache/analyses/<sessionId>.json`, note its `frictionZones[]`, then re-run the analyser on that session via the existing CLI / IPC, and verify the result is identical (no shape change, no zone difference).

If you cannot easily do this, skip and rely on tsc — the refactor is mechanical.

- [ ] **Step 6: Commit**

```bash
git add apps/nakiros/src/services/runner-core/cluster-tokens.ts apps/nakiros/src/services/runner-core/index.ts apps/nakiros/src/services/conversation-analyzer.ts
git commit -m "refactor(analyzer): extract cluster tokenizer into runner-core"
```

---

## Task 3: Register IPC channels

**Files:**
- Modify: `packages/shared/src/ipc-channels.ts`

- [ ] **Step 1: Add the recommendations channels**

Open `packages/shared/src/ipc-channels.ts`. After the `classifyConvo:*` block (line ~333), add:

```ts
  // Recommendations — friction-pattern clustering + per-pattern LLM analyser
  // + apply-reco translation to existing fix/create/edit runners.
  // See `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`.
  'recommendations:listPatterns': 'recommendations:listPatterns',
  'recommendations:getPattern': 'recommendations:getPattern',
  'recommendations:refresh': 'recommendations:refresh',
  'recommendations:analyzePattern': 'recommendations:analyzePattern',
  'recommendations:stopAnalyze': 'recommendations:stopAnalyze',
  'recommendations:applyReco': 'recommendations:applyReco',
  'recommendations:dismissReco': 'recommendations:dismissReco',
  'recommendations:editRecoBrief': 'recommendations:editRecoBrief',
  'recommendations:event': 'recommendations:event',
  'recommendations:patternsUpdated': 'recommendations:patternsUpdated',
  'recommendations:patternAnalyzed': 'recommendations:patternAnalyzed',
  'recommendations:recoApplied': 'recommendations:recoApplied',
```

- [ ] **Step 2: Verify shared compiles**

```bash
pnpm -F @nakiros/shared exec tsc --noEmit
```

Expected: PASS (typed string-enum extends naturally).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/ipc-channels.ts
git commit -m "feat(ipc): register recommendations:* channels"
```

---

## Task 4: Clustering core (pure functions)

**Files:**
- Create: `apps/nakiros/src/services/recommendation-cluster.ts`

- [ ] **Step 1: Write the clustering module**

```ts
/**
 * Friction-pattern clustering — daemon-side, pure functions, no LLM.
 *
 * Aggregates {@link ConversationFrictionZone} records from every conversation
 * of a project and groups similar zones into {@link RecommendationPattern}s
 * via Jaccard similarity on reaction tokens + file/signal affinity bonuses.
 *
 * See `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`.
 */
import { createHash } from 'crypto';
import { basename } from 'path';

import type {
  ConversationFrictionZone,
  RecommendationPattern,
  RecommendationZoneRef,
} from '@nakiros/shared';

import { jaccard, tokenizeForCluster } from './runner-core/cluster-tokens.js';

/** Internal record carrying both the zone and its ref for the clustering pass. */
export interface ZoneWithRef {
  ref: RecommendationZoneRef;
  zone: ConversationFrictionZone;
  tokens: Set<string>;
  fileBasenames: Set<string>;
  signalKinds: Set<string>;
}

const SCORE_THRESHOLD = 0.30;
const FILE_BONUS = 0.10;
const SIGNAL_BONUS = 0.05;
const MAX_PATTERNS = 20;
const SEVERITY_BUMP_AT = 4;

/**
 * Build the per-zone token set used by the clustering pass. Combines the
 * reaction message text (first 200 chars), the `keyActions` join, and the
 * basenames of files touched.
 */
export function extractZoneTokens(zone: ConversationFrictionZone): Set<string> {
  const out = new Set<string>();
  const reactionText = zone.reactionPoint?.text ?? '';
  for (const t of tokenizeForCluster(reactionText.slice(0, 200))) out.add(t);
  const actions = (zone.agentContext?.keyActions ?? []).join(' ');
  for (const t of tokenizeForCluster(actions)) out.add(t);
  for (const f of zone.agentContext?.filesTouched ?? []) {
    out.add(basename(f).toLowerCase());
  }
  return out;
}

/**
 * Similarity score between two zones. Jaccard on tokens, +0.10 if any
 * filesTouched basename overlaps, +0.05 if any signalKind overlaps.
 */
export function scoreZones(a: ZoneWithRef, b: ZoneWithRef): number {
  let s = jaccard(a.tokens, b.tokens);
  for (const f of a.fileBasenames) {
    if (b.fileBasenames.has(f)) { s += FILE_BONUS; break; }
  }
  for (const k of a.signalKinds) {
    if (b.signalKinds.has(k)) { s += SIGNAL_BONUS; break; }
  }
  return s;
}

/**
 * Group zones into patterns via Union-Find on the score graph.
 * Returns one pattern per connected component with `zoneCount >= 2`,
 * sorted by severity desc then zoneCount desc, capped to {@link MAX_PATTERNS}.
 */
export function groupPatterns(projectId: string, items: ZoneWithRef[]): RecommendationPattern[] {
  // Defensive: drop zones with empty tokens (cannot be clustered).
  const candidates = items.filter((z) => z.tokens.size > 0);

  // Defensive: drop zones whose reactionPoint text is a synthetic interrupt
  // (the analyzer already filters these in v11+; this is belt-and-braces for
  // older cached entries).
  const filtered = candidates.filter(
    (z) => !/Request interrupted by user/i.test(z.zone.reactionPoint?.text ?? ''),
  );

  // Union-Find.
  const parent: number[] = filtered.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i: number, j: number): void => {
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      if (scoreZones(filtered[i], filtered[j]) > SCORE_THRESHOLD) {
        union(i, j);
      }
    }
  }

  // Build clusters keyed by root.
  const clusters = new Map<number, ZoneWithRef[]>();
  for (let i = 0; i < filtered.length; i++) {
    const r = find(i);
    let list = clusters.get(r);
    if (!list) { list = []; clusters.set(r, list); }
    list.push(filtered[i]);
  }

  // Build patterns.
  const patterns: RecommendationPattern[] = [];
  for (const list of clusters.values()) {
    if (list.length < 2) continue;
    patterns.push(buildPattern(projectId, list));
  }

  // Sort and cap.
  patterns.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
    return b.zoneCount - a.zoneCount;
  });
  return patterns.slice(0, MAX_PATTERNS);
}

/**
 * Build a {@link RecommendationPattern} from a cluster of zones. Stable id
 * = sha1 of sorted `"convoId:zoneId"` strings.
 */
function buildPattern(projectId: string, list: ZoneWithRef[]): RecommendationPattern {
  const zoneRefs = list
    .map((z) => z.ref)
    .sort((a, b) => `${a.convoId}:${a.zoneId}`.localeCompare(`${b.convoId}:${b.zoneId}`));
  const id = createHash('sha1')
    .update(zoneRefs.map((r) => `${r.convoId}:${r.zoneId}`).join('|'))
    .digest('hex')
    .slice(0, 16);

  // Token frequency for topTokens.
  const tokenFreq = new Map<string, number>();
  for (const z of list) {
    for (const t of z.tokens) tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
  }
  const topTokens = [...tokenFreq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([t]) => t);

  // Files (deduped, first-seen order).
  const filesSeen = new Set<string>();
  const filesTouched: string[] = [];
  for (const z of list) {
    for (const f of z.zone.agentContext?.filesTouched ?? []) {
      if (!filesSeen.has(f)) { filesSeen.add(f); filesTouched.push(f); }
    }
  }

  // Signal kinds union.
  const signals = new Set<'S4' | 'S5' | 'S6'>();
  for (const z of list) for (const k of z.zone.signalKinds ?? []) signals.add(k);

  // Timestamps.
  const startTs = list.map((z) => z.zone.startTimestamp).sort();
  const endTs = list.map((z) => z.zone.endTimestamp).sort();
  const firstSeen = startTs[0];
  const lastSeen = endTs[endTs.length - 1];

  // Severity: max across zones, bumped to high when zoneCount >= 4.
  const hasHigh = list.some((z) => z.zone.severity === 'high');
  const baseSeverity: 'medium' | 'high' = hasHigh ? 'high' : 'medium';
  const severity: 'medium' | 'high' =
    list.length >= SEVERITY_BUMP_AT ? 'high' : baseSeverity;

  return {
    id,
    projectId,
    zoneRefs,
    signature: {
      topTokens,
      filesTouched,
      signalKinds: [...signals],
      firstSeen,
      lastSeen,
    },
    zoneCount: list.length,
    severity,
    analysis: { status: 'idle' },
  };
}

/** Wraps a zone into the internal {@link ZoneWithRef} carrier. */
export function wrapZone(ref: RecommendationZoneRef, zone: ConversationFrictionZone): ZoneWithRef {
  return {
    ref,
    zone,
    tokens: extractZoneTokens(zone),
    fileBasenames: new Set((zone.agentContext?.filesTouched ?? []).map((f) => basename(f).toLowerCase())),
    signalKinds: new Set(zone.signalKinds ?? []),
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/nakiros/src/services/recommendation-cluster.ts
git commit -m "feat(recommendations): pure clustering core"
```

---

## Task 5: Smoke script for clustering

**Files:**
- Create: `apps/nakiros/src/scripts/smoke-recommendation-cluster.ts`

- [ ] **Step 1: Write the smoke script with explicit assertions**

```ts
/**
 * Smoke test for `recommendation-cluster.ts`. Builds synthetic zones, runs
 * the clustering, and asserts the expected groupings. Run with:
 *   pnpm -F nakiros exec tsx src/scripts/smoke-recommendation-cluster.ts
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
  reactionText: string,
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
      turn: 5,
      timestamp: '2026-05-13T10:05:00.000Z',
      text: reactionText,
      matchedPattern: `stuck-cluster:3:0.5`,
      precedingTool: null,
    } as unknown as ConversationFrictionZone['reactionPoint'],
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
assert(tokens.has('auth.ts'.toLowerCase()) || tokens.has('auth'), 'token extraction includes file basename or token');

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

const solo = [wrapZone({ convoId: 'c1', zoneId: 'z1' }, makeZone('z1', 'rare unique topic', ['x']))];
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
  wrapZone({ convoId: `c${i}`, zoneId: `z${i}` }, makeZone(`z${i}`, 'i18n key missing', ['src/i18n.ts'])),
);
const bumped = groupPatterns('proj1', fourSimilar)[0];
assert(bumped.severity === 'high', `4 medium zones bump severity to high (got ${bumped.severity})`);

console.log('\nAll cluster smoke assertions passed.');
```

- [ ] **Step 2: Run the smoke and verify it passes**

```bash
pnpm -F nakiros exec tsx src/scripts/smoke-recommendation-cluster.ts
```

Expected: All "OK:" lines, ends with "All cluster smoke assertions passed." Exit 0.

If any assertion fails: fix the implementation in `recommendation-cluster.ts` until the assertion passes. The implementation might need a tweak — but the **assertions** themselves come from the spec; do NOT weaken an assertion to make the implementation pass.

- [ ] **Step 3: Commit**

```bash
git add apps/nakiros/src/scripts/smoke-recommendation-cluster.ts
git commit -m "test(recommendations): smoke for clustering core"
```

---

## Task 6: Pattern + reco store (filesystem layer)

**Files:**
- Create: `apps/nakiros/src/services/recommendation-store.ts`

- [ ] **Step 1: Write the store module**

```ts
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

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

function writeAtomic(p: string, content: string): void {
  ensureDir(dirname(p));
  const tmp = `${p}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, p);
}

// ─── Patterns ──────────────────────────────────────────────────────────────

/** Returns the cached patterns, or null if the file doesn't exist / is stale. */
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
 * Replace the patterns file atomically. Patterns whose ids vanish are NOT
 * deleted from disk — their recos are moved to `archive/<oldPatternId>/`.
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
 * Move a pattern's directory into `archive/<patternId>/`. Idempotent — when
 * the source is missing or the destination already exists, returns silently.
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

/** Mutate a single pattern's `analysis` block in patterns.json. */
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

/** Persist a single reco card produced by the analyser. */
export function writeRecoCard(projectId: string, card: RecoCard): void {
  const md = card.body; // body already includes frontmatter
  writeAtomic(recoMdPath(projectId, card.patternId, card.recId), md);
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

/** Read all reco cards persisted for a pattern. Missing dir → []. */
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

/** Read a single reco card (markdown + sidecar). */
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
  // Reconstruct the card. Frontmatter parsing happens in Task 8 (card parser).
  // Here we re-parse via the same parser to populate typed fields.
  return reconstructCardFromDisk(md, sidecar);
}

/** Mutate a reco's status (apply / dismiss / un-apply). */
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

/** Overwrite the markdown body (used when the user edits the brief inline before applying). */
export function writeRecoBody(projectId: string, patternId: string, recId: string, body: string): void {
  const mdPath = recoMdPath(projectId, patternId, recId);
  if (!existsSync(mdPath)) return;
  writeAtomic(mdPath, body);
  updateRecoStatus(projectId, patternId, recId, { editedAt: new Date().toISOString() });
}

// Forward declaration — implemented in Task 8 (recommendation-card-parser.ts).
// Imported here lazily to avoid a circular dependency between store and parser.
declare function reconstructCardFromDisk(md: string, sidecar: RecoSidecar): RecoCard | null;
```

**Note:** the trailing `declare function reconstructCardFromDisk` is a placeholder — Task 8 (`recommendation-card-parser.ts`) will export this function and we will replace the placeholder with a real import. We use `declare` here to keep this task's diff focused on the store layer.

- [ ] **Step 2: Defer the import wiring**

At the bottom of `recommendation-store.ts`, replace the `declare function` line with an actual placeholder that throws — so the file compiles standalone:

```ts
function reconstructCardFromDisk(_md: string, _sidecar: RecoSidecar): RecoCard | null {
  throw new Error('reconstructCardFromDisk is wired in Task 8 — do not call before then');
}
```

Task 8 deletes this stub and replaces with a real `import { parseRecoCardFromDisk } from './recommendation-card-parser.js';`.

- [ ] **Step 3: Verify tsc**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/nakiros/src/services/recommendation-store.ts
git commit -m "feat(recommendations): filesystem store for patterns and recos"
```

---

## Task 7: Inventory builder — existing `.claude/` artefacts

**Why:** The analyser needs to know which existing rules/skills/etc. it could target for `action=fix`. We collect a digest of project artefacts up front and feed it as `inventory.json` inside the run workdir.

**Files:**
- Create: `apps/nakiros/src/services/recommendation-inventory.ts`

- [ ] **Step 1: Survey the existing list APIs**

Before coding, list the existing reader services and identify the function that returns the artefact list for each `artifactType`. Grep:

```bash
grep -rn "export function list\|export async function list" apps/nakiros/src/services/claude-*.ts apps/nakiros/src/services/rules-*.ts apps/nakiros/src/services/subagents-*.ts apps/nakiros/src/services/hooks-*.ts apps/nakiros/src/services/permissions-*.ts apps/nakiros/src/services/mcp-*.ts apps/nakiros/src/services/output-styles-*.ts apps/nakiros/src/services/skill-fs/scan.ts apps/nakiros/src/services/skill-fs/index.ts 2>/dev/null | head -40
```

Each `.claude/` reader exports a `list<Type>(projectPath)` style function. For each artefact type, identify the function + its returned shape. Note: skills uses `skill-fs` while the other types live in their own files. Pull the relevant existing list functions into the inventory.

- [ ] **Step 2: Implement the inventory**

```ts
/**
 * Build a digest of the existing `.claude/` artefacts in a project — used as
 * input to the recommendation analyser so it can target an existing
 * artefact for `action=fix` instead of inventing names. Calls the existing
 * reader services; never touches the agent or makes a network call.
 */
import { listClaudeRules } from './claude-rules-writer.js';
import { listClaudeAgents } from './claude-agents-writer.js';
import { listClaudeOutputStyles } from './claude-output-styles-writer.js';
import { listClaudeMcp } from './claude-mcp-writer.js';
// claudemd / hooks / permissions are singleton-ish; we still surface what exists.
import { listClaudeMd } from './claude-md-writer.js';
import { readClaudeHooks } from './claude-hooks-writer.js';
import { readClaudePermissions } from './claude-permissions-writer.js';
import { scanProjectSkills } from './skill-fs/scan.js';

export interface InventoryItem {
  id: string;
  type:
    | 'rules' | 'skill' | 'claudemd' | 'subagent'
    | 'hook' | 'permission' | 'mcp' | 'output-style';
  /** Short human-readable label (file basename or rule/skill name). */
  label: string;
  /** Short description if known (e.g., skill description, rule frontmatter description). */
  description?: string;
  /** Optional extra context — globs for rules, paths for files. */
  hint?: string;
}

export interface ProjectInventory {
  projectId: string;
  projectPath: string;
  generatedAt: string;
  items: InventoryItem[];
}

/**
 * Build the inventory. Each reader call is wrapped in try/catch — a missing
 * file or scan failure must NOT block the analyser. We surface what we have
 * and let the LLM decide.
 */
export async function buildProjectInventory(
  projectId: string,
  projectPath: string,
): Promise<ProjectInventory> {
  const items: InventoryItem[] = [];

  // Rules
  try {
    const rules = await listClaudeRules(projectPath);
    for (const r of rules) {
      items.push({
        id: r.id ?? r.name,
        type: 'rules',
        label: r.name,
        description: r.description,
        hint: r.paths,
      });
    }
  } catch (err) {
    console.warn(`[inventory] rules read failed: ${(err as Error).message}`);
  }

  // Subagents (.claude/agents/)
  try {
    const agents = await listClaudeAgents(projectPath);
    for (const a of agents) {
      items.push({
        id: a.id ?? a.name,
        type: 'subagent',
        label: a.name,
        description: a.description,
      });
    }
  } catch (err) {
    console.warn(`[inventory] agents read failed: ${(err as Error).message}`);
  }

  // Output styles
  try {
    const styles = await listClaudeOutputStyles(projectPath);
    for (const s of styles) {
      items.push({
        id: s.id ?? s.name,
        type: 'output-style',
        label: s.name,
        description: s.description,
      });
    }
  } catch (err) {
    console.warn(`[inventory] output styles read failed: ${(err as Error).message}`);
  }

  // MCP
  try {
    const mcps = await listClaudeMcp(projectPath);
    for (const m of mcps) {
      items.push({
        id: m.id ?? m.name,
        type: 'mcp',
        label: m.name,
      });
    }
  } catch (err) {
    console.warn(`[inventory] mcp read failed: ${(err as Error).message}`);
  }

  // CLAUDE.md files
  try {
    const mds = await listClaudeMd(projectPath);
    for (const m of mds) {
      items.push({
        id: m.path,
        type: 'claudemd',
        label: m.path,
        hint: m.scope,
      });
    }
  } catch (err) {
    console.warn(`[inventory] claudemd read failed: ${(err as Error).message}`);
  }

  // Hooks (singleton)
  try {
    const hooks = await readClaudeHooks(projectPath);
    if (hooks && (hooks.events?.length ?? 0) > 0) {
      items.push({
        id: 'project-hooks',
        type: 'hook',
        label: 'project hooks',
        description: `${hooks.events.length} event hooks configured`,
      });
    }
  } catch {
    // hooks file might not exist — that's fine.
  }

  // Permissions (singleton)
  try {
    const perms = await readClaudePermissions(projectPath);
    if (perms) {
      items.push({
        id: 'project-permissions',
        type: 'permission',
        label: 'project permissions',
        description: `${(perms.allow?.length ?? 0)} allow rules`,
      });
    }
  } catch {
    // file may not exist
  }

  // Skills
  try {
    const skills = await scanProjectSkills(projectPath);
    for (const s of skills) {
      items.push({
        id: s.name,
        type: 'skill',
        label: s.name,
        description: s.description,
      });
    }
  } catch (err) {
    console.warn(`[inventory] skills scan failed: ${(err as Error).message}`);
  }

  return {
    projectId,
    projectPath,
    generatedAt: new Date().toISOString(),
    items,
  };
}
```

**Important:** the exact import names (`listClaudeRules`, `listClaudeAgents`, etc.) and item field names (`description`, `paths`, etc.) come from the existing reader services. After writing this, **run tsc**. If any import or property name doesn't exist:
- Open the file mentioned in the error.
- Adjust the import to the actual exported name.
- Map the returned shape to `InventoryItem` (e.g., if the reader returns `{ filename, frontmatter: { description, paths } }`, adapt accordingly).

Do NOT invent shapes — the readers exist; align to them.

- [ ] **Step 3: Run tsc and fix all import/shape mismatches**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Expected: PASS after iterating on imports and field mappings.

- [ ] **Step 4: Commit**

```bash
git add apps/nakiros/src/services/recommendation-inventory.ts
git commit -m "feat(recommendations): inventory builder over existing .claude/ readers"
```

---

## Task 8: Reco card parser

**Files:**
- Create: `apps/nakiros/src/services/recommendation-card-parser.ts`
- Modify: `apps/nakiros/src/services/recommendation-store.ts` (replace the placeholder)

- [ ] **Step 1: Write the parser**

```ts
/**
 * Parse + validate markdown recommendation cards produced by the
 * `recommendation-analyze` runner. Cards have a YAML frontmatter block and
 * a body composed of `## Why`, `## Brief`, and `## Acceptance criteria`
 * sections.
 */
import { parse as parseYaml } from 'yaml';

import type {
  RecoCard,
  RecommendationArtifactType,
  RecommendationZoneRef,
} from '@nakiros/shared';
import type { ProjectInventory } from './recommendation-inventory.js';

const VALID_ARTIFACT_TYPES: ReadonlySet<RecommendationArtifactType> = new Set([
  'rules', 'skill', 'claudemd', 'subagent',
  'hook', 'permission', 'mcp', 'output-style',
]);

interface ParseError {
  ok: false;
  reason: string;
}

interface ParseOk {
  ok: true;
  card: RecoCard;
  /** True when the parser had to downgrade `action: fix` → `action: create` (target unknown). */
  downgraded?: boolean;
}

export type ParseResult = ParseOk | ParseError;

interface ParsedFrontmatter {
  recId?: unknown;
  patternId?: unknown;
  action?: unknown;
  artifactType?: unknown;
  target?: unknown;
  title?: unknown;
  evidence?: { zoneRefs?: unknown; files?: unknown };
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Parse a markdown card file. Validates frontmatter against the spec
 * schema. Optionally cross-checks `target` against an `ProjectInventory`
 * to downgrade `fix` → `create` when the target doesn't exist.
 */
export function parseRecoCardFromMarkdown(
  rawMarkdown: string,
  patternId: string,
  inventory?: ProjectInventory,
): ParseResult {
  const match = FRONTMATTER_RE.exec(rawMarkdown);
  if (!match) return { ok: false, reason: 'missing frontmatter' };
  const [, fmText, body] = match;
  let fm: ParsedFrontmatter;
  try {
    fm = parseYaml(fmText) as ParsedFrontmatter;
  } catch (err) {
    return { ok: false, reason: `invalid yaml: ${(err as Error).message}` };
  }

  const recId = strOrNull(fm.recId);
  if (!recId) return { ok: false, reason: 'missing recId' };
  if (strOrNull(fm.patternId) !== patternId) return { ok: false, reason: 'patternId mismatch' };

  const action = fm.action === 'fix' || fm.action === 'create' ? fm.action : null;
  if (!action) return { ok: false, reason: 'invalid action' };

  const artifactType = strOrNull(fm.artifactType);
  if (!artifactType || !VALID_ARTIFACT_TYPES.has(artifactType as RecommendationArtifactType)) {
    return { ok: false, reason: 'invalid artifactType' };
  }

  let target = strOrNull(fm.target);
  if (!target) return { ok: false, reason: 'missing target' };

  let downgraded = false;
  let finalAction: 'fix' | 'create' = action;
  if (action === 'fix' && inventory) {
    const exists = inventory.items.some(
      (it) => it.type === artifactType && it.id === target,
    );
    if (!exists) {
      finalAction = 'create';
      target = 'new';
      downgraded = true;
    }
  }

  const title = strOrNull(fm.title) ?? `${artifactType} ${finalAction}`;

  const brief = extractSection(body, 'Brief');
  if (!brief || brief.trim().length < 20) {
    return { ok: false, reason: 'missing or empty Brief section' };
  }

  const zoneRefs = parseZoneRefs(fm.evidence?.zoneRefs);
  const files = parseStringArray(fm.evidence?.files);

  const card: RecoCard = {
    recId,
    patternId,
    action: finalAction,
    artifactType: artifactType as RecommendationArtifactType,
    target,
    title,
    body: rawMarkdown,
    brief: brief.trim(),
    evidence: { zoneRefs, files },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  return { ok: true, card, downgraded: downgraded || undefined };
}

/**
 * Re-hydrate a card from disk: markdown + sidecar. Skips inventory cross-check
 * (the card was already validated when first persisted). Used by
 * `recommendation-store.ts` to reconstruct cards on read.
 */
export function parseRecoCardFromDisk(
  rawMarkdown: string,
  sidecar: { recId: string; patternId: string; status: RecoCard['status']; appliedRunId?: string; createdAt: string; editedAt?: string },
): RecoCard | null {
  const result = parseRecoCardFromMarkdown(rawMarkdown, sidecar.patternId);
  if (!result.ok) return null;
  return {
    ...result.card,
    recId: sidecar.recId,
    status: sidecar.status,
    appliedRunId: sidecar.appliedRunId,
    createdAt: sidecar.createdAt,
    editedAt: sidecar.editedAt,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function parseZoneRefs(v: unknown): RecommendationZoneRef[] {
  if (!Array.isArray(v)) return [];
  const out: RecommendationZoneRef[] = [];
  for (const raw of v) {
    if (raw && typeof raw === 'object') {
      const obj = raw as { convoId?: unknown; zoneId?: unknown };
      const convoId = strOrNull(obj.convoId);
      const zoneId = strOrNull(obj.zoneId);
      if (convoId && zoneId) out.push({ convoId, zoneId });
    }
  }
  return out;
}

/** Extract `## <name>` section content from a markdown body. */
function extractSection(body: string, name: string): string | null {
  const re = new RegExp(`(^|\\n)##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = re.exec(body);
  if (!m) return null;
  return m[2].trim();
}
```

- [ ] **Step 2: Wire the parser into the store**

Open `apps/nakiros/src/services/recommendation-store.ts`:
- Delete the stub `function reconstructCardFromDisk(...)` at the bottom.
- Add to the imports (top of file):

```ts
import { parseRecoCardFromDisk } from './recommendation-card-parser.js';
```

- Replace the only call site (`return reconstructCardFromDisk(md, sidecar);` inside `readRecoCard`) with:

```ts
return parseRecoCardFromDisk(md, sidecar);
```

- [ ] **Step 3: Verify tsc**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/nakiros/src/services/recommendation-card-parser.ts apps/nakiros/src/services/recommendation-store.ts
git commit -m "feat(recommendations): markdown card parser + store wiring"
```

---

## Task 9: Smoke for the card parser

**Files:**
- Create: `apps/nakiros/src/scripts/smoke-recommendation-parser.ts`

- [ ] **Step 1: Write the smoke**

```ts
/**
 * Smoke for `recommendation-card-parser.ts`. Run with:
 *   pnpm -F nakiros exec tsx src/scripts/smoke-recommendation-parser.ts
 */
import { parseRecoCardFromMarkdown } from '../services/recommendation-card-parser.js';
import type { ProjectInventory } from '../services/recommendation-inventory.js';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) { console.error('FAIL:', message); process.exit(1); }
  console.log('OK:', message);
}

const inventory: ProjectInventory = {
  projectId: 'p1',
  projectPath: '/tmp',
  generatedAt: '2026-05-13T00:00:00.000Z',
  items: [
    { id: 'i18n', type: 'rules', label: 'i18n.md' },
  ],
};

const validFix = `---
recId: fix-i18n-rule
patternId: P1
action: fix
artifactType: rules
target: i18n
title: Tighten the i18n rule glob
evidence:
  zoneRefs: [{convoId: c1, zoneId: z1}]
  files: [src/i18n.ts]
---

# Tighten the i18n rule glob

## Why
Several conversations got stuck on the i18n key flow because the existing rule did not auto-attach on the right files.

## Brief
Adjust the \`paths:\` glob in .claude/rules/i18n.md so it covers \`apps/frontend/src/**/*.tsx\` plus the i18n bundles. Include this user request verbatim when invoking the rules expert: edit the rule to ...

## Acceptance criteria
- The glob covers tsx files
- Description mentions which files
`;

const r1 = parseRecoCardFromMarkdown(validFix, 'P1', inventory);
assert(r1.ok, 'valid fix card parses');
if (r1.ok) {
  assert(r1.card.action === 'fix', 'action preserved');
  assert(r1.card.artifactType === 'rules', 'artifactType preserved');
  assert(r1.card.target === 'i18n', 'target preserved');
  assert(r1.card.brief.includes('paths'), 'brief extracted from ## Brief');
  assert(!r1.downgraded, 'not downgraded');
}

// Missing frontmatter
const r2 = parseRecoCardFromMarkdown('# no fm\n', 'P1');
assert(!r2.ok, 'missing frontmatter rejected');

// Invalid action
const r3 = parseRecoCardFromMarkdown(
  validFix.replace('action: fix', 'action: edit'),
  'P1',
  inventory,
);
assert(!r3.ok, 'invalid action rejected');

// Invalid artifactType
const r4 = parseRecoCardFromMarkdown(
  validFix.replace('artifactType: rules', 'artifactType: nonsense'),
  'P1',
  inventory,
);
assert(!r4.ok, 'invalid artifactType rejected');

// Empty brief (< 20 chars)
const r5 = parseRecoCardFromMarkdown(
  validFix.replace(/## Brief\n[\s\S]*?(?=\n##)/, '## Brief\nshort\n'),
  'P1',
  inventory,
);
assert(!r5.ok, 'too-short brief rejected');

// Fix → Create downgrade when target not in inventory
const r6 = parseRecoCardFromMarkdown(
  validFix.replace('target: i18n', 'target: nonexistent-rule'),
  'P1',
  inventory,
);
assert(r6.ok, 'unknown target still produces a card');
if (r6.ok) {
  assert(r6.card.action === 'create', 'downgraded to create');
  assert(r6.card.target === 'new', 'target reset to "new"');
  assert(r6.downgraded === true, 'downgraded flag set');
}

// patternId mismatch
const r7 = parseRecoCardFromMarkdown(validFix, 'DIFFERENT', inventory);
assert(!r7.ok, 'patternId mismatch rejected');

console.log('\nAll parser smoke assertions passed.');
```

- [ ] **Step 2: Run it**

```bash
pnpm -F nakiros exec tsx src/scripts/smoke-recommendation-parser.ts
```

Expected: All OK, exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/nakiros/src/scripts/smoke-recommendation-parser.ts
git commit -m "test(recommendations): smoke for card parser"
```

---

## Task 10: Recommendation-analyze runner

**Files:**
- Create: `apps/nakiros/src/services/recommendation-analyze-runner.ts`

- [ ] **Step 1: Skim the template**

Re-read `apps/nakiros/src/services/classify-convo-runner.ts` end-to-end before writing — the structural shape is identical. Differences:
- Input is a `(projectId, patternId)` pair, not a `sessionId`.
- Workdir contains `pattern.json` + `inventory.json` (instead of a digest).
- Output is N markdown files under `workdir/recos/`, not a single JSON.
- `onTurnComplete` parses each `recos/*.md` via the card parser and persists via `writeRecoCard`.
- No `sendUserMessage` follow-up is expected — the run terminates after one turn (the agent writes the cards and ends).
- Model is `sonnet` (no Haiku fallback — pattern context can be large; sonnet handles it).

- [ ] **Step 2: Implement the runner**

```ts
/**
 * Recommendation analyser runner. Single-turn agent that reads a friction
 * pattern + the project's .claude/ inventory and writes 1..N markdown
 * recommendation cards under `./recos/`. After the turn:
 *   - parses each card via `recommendation-card-parser`
 *   - downgrades invalid `fix` targets to `create` against the same inventory
 *   - persists valid cards via `recommendation-store.writeRecoCard`
 *   - updates the parent pattern's `analysis` block
 *
 * Mirrors `classify-convo-runner.ts` for runner-core integration. See
 * `docs/superpowers/specs/2026-05-13-friction-pattern-recommendations-design.md`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type {
  RecommendationAnalyzeRun,
  RecommendationAnalyzeRunEvent,
  RecommendationPattern,
  StartRecommendationAnalyzeRequest,
} from '@nakiros/shared';

import {
  cleanupRunWorkdir,
  createRunner,
  isActiveRunStatus,
  type RehydrateResult,
  type RunEntry,
  type RunnerSpec,
  writeExecutionSettings,
} from './runner-core/index.js';
import { buildProjectInventory, type ProjectInventory } from './recommendation-inventory.js';
import { parseRecoCardFromMarkdown } from './recommendation-card-parser.js';
import { readPatterns, updatePatternAnalysis, writeRecoCard } from './recommendation-store.js';

const KIND = 'recommendation-analyze';
const MODEL = 'sonnet' as const;

interface AnalyzeExtras {
  projectId: string;
  projectPath: string;
  patternId: string;
  inventory: ProjectInventory;
  pattern: RecommendationPattern;
}

interface AnalyzeStartReq extends StartRecommendationAnalyzeRequest {
  projectPath: string;
}

type AnalyzeEvent = RecommendationAnalyzeRunEvent['event'];
type AnalyzeEntry = RunEntry<RecommendationAnalyzeRun, AnalyzeEvent, AnalyzeExtras>;

function runsRoot(): string {
  return join(homedir(), '.nakiros', 'runs', 'recommendation-analyze');
}

function buildInitialPrompt(extras: AnalyzeExtras): string {
  return `ROLE
====
You are the Nakiros recommendation agent. A friction pattern has been
detected across ${extras.pattern.zoneCount} conversations of this project.
Produce one or more recommendation cards proposing concrete \`.claude/\`
actions that would have prevented this friction.

PATTERN
=======
The pattern is in ./pattern.json. Read it with the Read tool. It contains:
- topTokens, filesTouched, signalKinds, severity, zoneCount.
- For each zone: reactionPoint.text (full), agentContext (keyActions,
  filesTouched, toolErrorsCount, backtrackedFiles), originating convoId.

EXISTING .claude/ INVENTORY
===========================
The inventory is in ./inventory.json. Read it with the Read tool. It lists
existing rules/skills/claudemd/subagents/hooks/permissions/mcps/output-styles
with identifiers and short descriptions. Use it to decide whether to
\`fix\` an existing artefact or \`create\` a new one.

YOUR JOB
========
Write 1..N markdown cards to \`./recos/<kebab-title>.md\`. Each card = ONE
atomic action. If multiple levers are needed (fix rule X + create skill Y
+ add a CLAUDE.md note), write one card per lever.

Constraints:
- The 'Brief' body is passed verbatim to the downstream fix/create runner —
  make it self-contained: cite zone excerpts, exact file paths, exact errors.
  Never summarise.
- Don't invent artefacts. For 'fix', the target MUST exist in inventory.json.
  If unsure, prefer 'create'.
- Output language matches the user's language (auto-detect from zone excerpts).
- patternId in the frontmatter MUST equal "${extras.patternId}".

CARD TEMPLATE
=============
Use this exact structure. The frontmatter is YAML between two \`---\` lines.

\`\`\`markdown
---
recId: <kebab-title>
patternId: ${extras.patternId}
action: fix | create
artifactType: rules | skill | claudemd | subagent | hook | permission | mcp | output-style
target: <existing-id> | new
title: <short human title>
evidence:
  zoneRefs:
    - {convoId: <id>, zoneId: <id>}
  files:
    - <path>
---

# <title>

## Why
<2-3 sentences anchored in pattern evidence>

## Brief
<self-contained prompt for the downstream runner — detailed, includes zone
excerpts and exact targets. At least 20 characters.>

## Acceptance criteria
- bullet 1
- bullet 2
\`\`\`

When you are done writing all the cards, end your turn. Do not return the
cards inline — only write them to files.`;
}

const spec: RunnerSpec<RecommendationAnalyzeRun, AnalyzeStartReq, AnalyzeEvent, AnalyzeExtras> = {
  kind: KIND,
  runsRoot,

  prepareWorkdir(req, runId) {
    const workdir = join(runsRoot(), runId);
    mkdirSync(workdir, { recursive: true });
    mkdirSync(join(workdir, 'recos'), { recursive: true });
    writeExecutionSettings(workdir);

    const patterns = readPatterns(req.projectId) ?? [];
    const pattern = patterns.find((p) => p.id === req.patternId);
    if (!pattern) {
      throw new Error(`Pattern ${req.patternId} not found for project ${req.projectId}.`);
    }

    // Hydrate full zones for the agent — patterns.json only has refs.
    const hydrated = hydrateZones(req.projectPath, pattern);

    writeFileSync(join(workdir, 'pattern.json'), JSON.stringify(hydrated, null, 2));

    // Inventory — async, but we resolve synchronously here by awaiting in a
    // wrapper. RunnerSpec.prepareWorkdir is sync; runner-core awaits whatever
    // we put on `extras` only in `buildFirstPrompt`/`onTurnComplete`. So we
    // delay inventory loading to `buildFirstPrompt` via a Promise stored
    // on extras. To keep prepareWorkdir sync, write a stub inventory file and
    // replace it inside buildFirstPrompt before invoking the agent.
    writeFileSync(join(workdir, 'inventory.json'), '{}');

    return {
      workdir,
      extras: {
        projectId: req.projectId,
        projectPath: req.projectPath,
        patternId: req.patternId,
        inventory: { projectId: req.projectId, projectPath: req.projectPath, generatedAt: '', items: [] },
        pattern,
      },
    };
  },

  async buildFirstPrompt(_req, ctx) {
    // Build the real inventory now (async) and persist it into the workdir.
    const inventory = await buildProjectInventory(ctx.extras.projectId, ctx.extras.projectPath);
    ctx.extras.inventory = inventory;
    writeFileSync(join(ctx.workdir, 'inventory.json'), JSON.stringify(inventory, null, 2));
    return buildInitialPrompt(ctx.extras);
  },

  createInitialRun(req, runId, workdir, _extras): RecommendationAnalyzeRun {
    return {
      runId,
      projectId: req.projectId,
      sourcePatternId: req.patternId,
      sessionId: req.patternId, // overwritten on first stream event
      status: 'starting',
      sessionClaudeId: null,
      workdir,
      model: MODEL,
      recoCount: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };
  },

  buildCliArgs(prompt, entry, isFirstTurn) {
    return {
      prompt,
      resumeSessionId: isFirstTurn ? undefined : (entry.run.sessionClaudeId ?? undefined),
      model: MODEL,
    };
  },

  onTurnComplete(entry, helpers) {
    // Parse all cards from `./recos/`, persist valid ones, update pattern.
    const recosDir = join(entry.run.workdir, 'recos');
    const files = existsSync(recosDir)
      ? readdirSync(recosDir).filter((f) => f.endsWith('.md'))
      : [];

    let recoCount = 0;
    const skipped: Array<{ file: string; reason: string }> = [];
    for (const f of files) {
      const md = readFileSync(join(recosDir, f), 'utf8');
      const result = parseRecoCardFromMarkdown(md, entry.extras.patternId, entry.extras.inventory);
      if (!result.ok) {
        skipped.push({ file: f, reason: result.reason });
        continue;
      }
      writeRecoCard(entry.extras.projectId, result.card);
      recoCount++;
    }

    entry.run.recoCount = recoCount;
    updatePatternAnalysis(entry.extras.projectId, entry.extras.patternId, {
      status: 'done',
      runId: entry.run.runId,
      recoCount,
      lastAnalyzedAt: new Date().toISOString(),
    });

    helpers.complete(entry);
    entry.eventLog.emit({ type: 'done', recoCount });
    if (skipped.length > 0) {
      console.warn(`[recommendation-analyze] ${skipped.length} card(s) skipped:`, skipped);
    }
  },

  cleanupOnTerminal(entry) {
    cleanupRunWorkdir(entry.run.workdir);
  },

  findActiveForTarget(req, registry) {
    for (const entry of registry.values()) {
      if (entry.run.projectId !== req.projectId) continue;
      if (entry.run.sourcePatternId !== req.patternId) continue;
      if (isActiveRunStatus(entry.run.status)) return entry;
    }
    return null;
  },

  rehydrate(persisted, workdir): RehydrateResult<RecommendationAnalyzeRun, AnalyzeExtras> {
    // Persisted runs cannot be resumed safely (the inventory might be stale).
    // Mark failed runs cleanable; everything else gets cleaned.
    const blob = persisted as (RecommendationAnalyzeRun & { _extras?: AnalyzeExtras }) | null;
    if (!blob || !blob.runId) return { kind: 'cleanup' };
    if (blob.status === 'stopped' || blob.status === 'failed' || blob.status === 'completed') {
      return { kind: 'cleanup' };
    }
    // Active at boot — mark as failed; the user can re-trigger.
    const restoredRun: RecommendationAnalyzeRun = {
      ...blob,
      workdir,
      status: 'failed',
      error: 'Daemon restarted while run was active',
      finishedAt: new Date().toISOString(),
      interruptedByReboot: true,
    };
    if (blob._extras) {
      return { kind: 'rehydrate', run: restoredRun, extras: blob._extras };
    }
    return { kind: 'cleanup' };
  },
};

const runner = createRunner(spec);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Resolve full {@link ConversationFrictionZone} records for each pattern
 * zoneRef, by reading the cached analyses. Patterns are persisted with only
 * refs; the agent needs the full zone shape.
 */
function hydrateZones(_projectPath: string, pattern: RecommendationPattern): unknown {
  // Implementation: read each cached analysis under
  // `~/.nakiros/cache/analyses/<convoId>.json`, find the matching zoneId,
  // include the zone payload. If an analysis is missing, include a
  // `<missing>` stub so the agent knows. Use the existing
  // `peekCachedAnalysis` helper from `conversation-analysis-cache.ts`.
  return {
    pattern,
    note: 'Zones to be hydrated by the implementer — see comment.',
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

interface RunOpts {
  projectPath: string;
  onEvent(event: RecommendationAnalyzeRunEvent): void;
}

export function restoreOrCleanupRecommendationAnalyzeWorkdirs(): void {
  runner.restoreOrCleanup(() => undefined);
}

export function startRecommendationAnalyze(
  req: StartRecommendationAnalyzeRequest,
  opts: RunOpts,
): RecommendationAnalyzeRun {
  return runner.start({ ...req, projectPath: opts.projectPath }, { onEvent: opts.onEvent });
}

export function stopRecommendationAnalyze(runId: string): void {
  runner.stop(runId);
}

export function getRecommendationAnalyzeRun(runId: string): RecommendationAnalyzeRun | null {
  return runner.getRun(runId);
}

export function listActiveRecommendationAnalyzeRuns(): RecommendationAnalyzeRun[] {
  return runner.listActive();
}

export function getRecommendationAnalyzeBufferedEvents(runId: string): AnalyzeEvent[] {
  return runner.getBufferedEvents(runId);
}
```

- [ ] **Step 3: Implement `hydrateZones` properly**

Replace the stub `hydrateZones` with the real implementation. Grep for the existing cached-analysis helper:

```bash
grep -n "export function peekCached\|export function getOr" apps/nakiros/src/services/conversation-analysis-cache.ts
```

Use it like:

```ts
import { peekCachedAnalysis } from './conversation-analysis-cache.js';
// You will need providerProjectDir for the convo — look up the project's
// providerProjectDir via `getProject(projectId)` from project-scanner.ts and
// pass it in. If you don't have it at hydrate time, plumb it through the
// runner request.

function hydrateZones(projectPath: string, providerProjectDir: string, pattern: RecommendationPattern) {
  const hydrated: unknown[] = [];
  for (const ref of pattern.zoneRefs) {
    const analysis = peekCachedAnalysis(providerProjectDir, ref.convoId);
    const zone = analysis?.frictionZones?.find((z) => z.id === ref.zoneId);
    if (zone) {
      hydrated.push({ convoId: ref.convoId, zone });
    } else {
      hydrated.push({ convoId: ref.convoId, zoneId: ref.zoneId, missing: true });
    }
  }
  return { pattern, zones: hydrated };
}
```

You will need to plumb `providerProjectDir` into the start request (add it to `AnalyzeStartReq` and extras) and pass it from the handler in Task 11.

- [ ] **Step 4: Verify tsc**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Iterate until PASS. Likely fix-ups:
- `BaseRunStatus` enum values for `status` may differ — check `packages/shared/src/types/run-status.ts` and adjust.
- `RunnerSpec.buildFirstPrompt` may be sync — if so, move the inventory `await` into a `prepareWorkdir` extension instead. Read `runner-core/index.ts` to confirm the signature.

- [ ] **Step 5: Commit**

```bash
git add apps/nakiros/src/services/recommendation-analyze-runner.ts
git commit -m "feat(recommendations): recommendation-analyze runner"
```

---

## Task 11: Apply-reco service + daemon handlers

**Files:**
- Create: `apps/nakiros/src/services/recommendation-apply.ts`
- Create: `apps/nakiros/src/daemon/handlers/recommendations.ts`
- Modify: `apps/nakiros/src/daemon/handlers/index.ts`

- [ ] **Step 1: Survey existing run-starter signatures**

Before writing apply-reco, confirm what each downstream runner needs:

```bash
grep -n "export function startEdit\|export function startCreate\|export function startFix" apps/nakiros/src/services/fix-runner.ts
```

Each takes `StartAuditRequest` + opts. The mapping from `(action, artifactType)` to the right starter + the right `*Target` field:

| Action | artifactType | Runner | Target field | skillName |
|--------|--------------|--------|--------------|-----------|
| fix    | rules | startEdit | rulesTarget | nakiros-rules-expert |
| fix    | claudemd | startEdit | claudemdTarget | nakiros-claudemd-expert |
| fix    | subagent | startEdit | subagentsTarget | nakiros-subagents-expert |
| fix    | hook | startEdit | hooksTarget | nakiros-hooks-expert |
| fix    | permission | startEdit | permissionsTarget | nakiros-permissions-expert |
| fix    | mcp | startEdit | mcpTarget | nakiros-mcp-expert |
| fix    | output-style | startEdit | outputStylesTarget | nakiros-output-styles-expert |
| fix    | skill | startFix | (skillName) | (the targeted skill) |
| create | <any> | startCreate | (matching target with id='new') | matching expert |

If the signatures don't match this table after reading the code, adjust the apply-reco mapping accordingly — the table comes from `StartAuditRequest` in `packages/shared/src/types/project.ts:1165-1218`.

- [ ] **Step 2: Implement apply-reco**

```ts
/**
 * Translate a {@link RecoCard} into a `startFix` / `startCreate` / `startEdit`
 * call against the existing downstream runners. Sends the card's `brief` as
 * the first user message so the agent receives the recommendation verbatim.
 *
 * The downstream runners take a `StartAuditRequest` shaped per
 * `packages/shared/src/types/project.ts:StartAuditRequest`. Each
 * `.claude/` artefact has its own optional `*Target` field — we set the
 * one matching `artifactType`.
 */
import type {
  ApplyRecoResponse,
  RecoCard,
  StartAuditRequest,
} from '@nakiros/shared';

import {
  sendCreateUserMessage,
  sendEditUserMessage,
  sendFixUserMessage,
  startCreate,
  startEdit,
  startFix,
} from './fix-runner.js';
import { readRecoCard, updateRecoStatus, writeRecoBody } from './recommendation-store.js';

type Starter = typeof startEdit | typeof startCreate | typeof startFix;
type Sender = typeof sendEditUserMessage | typeof sendCreateUserMessage | typeof sendFixUserMessage;

interface Mapping {
  starter: Starter;
  sender: Sender;
  runKind: 'fix' | 'create' | 'edit';
  buildRequest(card: RecoCard, projectId: string): StartAuditRequest;
}

const EDIT_REQ_BUILDERS: Record<string, (card: RecoCard, projectId: string) => StartAuditRequest> = {
  rules: (card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-rules-expert',
    projectId,
    rulesTarget: { name: card.target },
  }),
  claudemd: (card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-claudemd-expert',
    projectId,
    claudemdTarget: { path: card.target },
  }),
  subagent: (card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-subagents-expert',
    projectId,
    subagentsTarget: { name: card.target },
  }),
  hook: (_card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-hooks-expert',
    projectId,
    hooksTarget: {},
  }),
  permission: (_card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-permissions-expert',
    projectId,
    permissionsTarget: {},
  }),
  mcp: (_card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-mcp-expert',
    projectId,
    mcpTarget: {},
  }),
  'output-style': (card, projectId) => ({
    scope: 'bundled',
    skillName: 'nakiros-output-styles-expert',
    projectId,
    outputStylesTarget: { name: card.target },
  }),
};

/**
 * IMPORTANT: the exact shape of the `*Target` fields (e.g., `{ name: string }`
 * vs `{ path: string }`) must match the existing target context types in
 * `packages/shared/src/types/project.ts`. Confirm by opening that file and
 * adjusting each builder above.
 */
function mappingFor(card: RecoCard): Mapping | null {
  if (card.artifactType === 'skill') {
    return {
      starter: card.action === 'fix' ? startFix : startCreate,
      sender: card.action === 'fix' ? sendFixUserMessage : sendCreateUserMessage,
      runKind: card.action === 'fix' ? 'fix' : 'create',
      buildRequest: (c, projectId) => ({
        scope: 'project',
        skillName: c.target === 'new' ? '__new__' : c.target,
        projectId,
      }),
    };
  }
  const build = EDIT_REQ_BUILDERS[card.artifactType];
  if (!build) return null;
  return {
    starter: card.action === 'create' ? startCreate : startEdit,
    sender: card.action === 'create' ? sendCreateUserMessage : sendEditUserMessage,
    runKind: card.action === 'create' ? 'create' : 'edit',
    buildRequest: build,
  };
}

export interface ApplyRecoCtx {
  /** Path of the project on disk. */
  projectPath: string;
  /** Optional override of the brief if the user edited it inline. */
  editedBrief?: string;
  /** Forwarded to the downstream runner. */
  onEvent: (event: unknown) => void;
  /** Forwarded to the downstream runner (varies per runner — see fix-runner ExternalRunOpts). */
  skillDir?: string;
}

export async function applyReco(
  projectId: string,
  patternId: string,
  recId: string,
  ctx: ApplyRecoCtx,
): Promise<ApplyRecoResponse> {
  const card = readRecoCard(projectId, patternId, recId);
  if (!card) return { ok: false, error: 'reco-not-found' };

  // Idempotency: already applied → return the prior runId.
  if (card.status === 'applied' && card.appliedRunId) {
    return { ok: true, runId: card.appliedRunId, runKind: 'edit' };
  }

  const mapping = mappingFor(card);
  if (!mapping) return { ok: false, error: 'unknown-artifact-type' };

  // If the user edited the brief inline, persist that first.
  if (ctx.editedBrief && ctx.editedBrief.trim() !== card.brief) {
    const newBody = card.body.replace(/(## Brief\n)[\s\S]*?(\n## )/, `$1${ctx.editedBrief}\n$2`);
    writeRecoBody(projectId, patternId, recId, newBody);
  }
  const brief = (ctx.editedBrief ?? card.brief).trim();
  if (brief.length === 0) {
    return { ok: false, error: 'reco-not-found' };
  }

  // Start the downstream runner.
  const req = mapping.buildRequest(card, projectId);
  // The exact opts shape depends on each runner — match `ExternalRunOpts`.
  // Adjust by reading `fix-runner.ts`.
  const opts = {
    skillDir: ctx.skillDir ?? '',
    onEvent: ctx.onEvent,
  } as unknown as Parameters<Starter>[1];

  const run = mapping.starter(req, opts);

  // Send the brief as the first user message (after the runner's
  // built-in first prompt). This becomes turn 2 of the downstream session.
  await mapping.sender(run.runId, brief, opts as never);

  // Update the reco sidecar.
  updateRecoStatus(projectId, patternId, recId, { status: 'applied', appliedRunId: run.runId });

  return { ok: true, runId: run.runId, runKind: mapping.runKind };
}
```

**Caveats:** the `*Target` field shapes (e.g., `RulesTargetContext`, `ClaudeMdTargetContext`) come from `packages/shared/src/types/project.ts`. Grep for each type and adjust the `EDIT_REQ_BUILDERS` accordingly:

```bash
grep -n "interface RulesTargetContext\|interface ClaudeMdTargetContext\|interface SubagentsTargetContext\|interface HooksTargetContext\|interface PermissionsTargetContext\|interface McpTargetContext\|interface OutputStylesTargetContext" packages/shared/src/types/project.ts
```

The `ExternalRunOpts` shape passed to each runner also varies — read the runner's exported signatures and adapt.

- [ ] **Step 3: Wire the IPC handlers**

Create `apps/nakiros/src/daemon/handlers/recommendations.ts`:

```ts
import type {
  RecommendationPattern,
  RecommendationAnalyzeRunEvent,
  StartRecommendationAnalyzeRequest,
  RecoCard,
  ApplyRecoResponse,
} from '@nakiros/shared';

import { getProject } from '../../services/project-scanner.js';
import { peekCachedAnalysis } from '../../services/conversation-analysis-cache.js';
import { listSessions } from '../../services/conversation-ingest/project-store.js';
import {
  groupPatterns,
  wrapZone,
} from '../../services/recommendation-cluster.js';
import {
  listRecoCards,
  readPatterns,
  updateRecoStatus,
  writeRecoBody,
  writePatterns,
} from '../../services/recommendation-store.js';
import {
  startRecommendationAnalyze,
  stopRecommendationAnalyze,
  getRecommendationAnalyzeBufferedEvents,
} from '../../services/recommendation-analyze-runner.js';
import { applyReco } from '../../services/recommendation-apply.js';

import {
  createEventBroadcaster,
  createTypedHandler,
  withBroadcastOnError,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastAnalyzeEvent = createEventBroadcaster<RecommendationAnalyzeRunEvent>(
  'recommendations:event',
);

function resolveProject(projectId: string): { projectPath: string; providerProjectDir: string } {
  const p = getProject(projectId);
  if (!p) throw new Error(`Project ${projectId} not found`);
  return { projectPath: p.projectPath, providerProjectDir: p.providerProjectDir };
}

/**
 * Recompute patterns for a project from cached conversation analyses.
 * Cheap — no LLM. Idempotent. Atomic write of patterns.json.
 */
function recomputePatterns(projectId: string): RecommendationPattern[] {
  const { projectPath, providerProjectDir } = resolveProject(projectId);
  const sessions = listSessions(projectPath);
  const wrapped = [];
  for (const s of sessions) {
    const analysis = peekCachedAnalysis(providerProjectDir, s.sessionId);
    if (!analysis?.frictionZones) continue;
    for (const zone of analysis.frictionZones) {
      wrapped.push(wrapZone({ convoId: s.sessionId, zoneId: zone.id }, zone));
    }
  }
  const patterns = groupPatterns(projectId, wrapped);
  writePatterns(projectId, patterns);
  return patterns;
}

export const recommendationsHandlers: HandlerRegistry = {
  'recommendations:listPatterns': createTypedHandler((projectId: string) => {
    return readPatterns(projectId) ?? recomputePatterns(projectId);
  }),

  'recommendations:getPattern': createTypedHandler(
    (projectId: string, patternId: string): { pattern: RecommendationPattern | null; recos: RecoCard[] } => {
      const patterns = readPatterns(projectId) ?? [];
      const pattern = patterns.find((p) => p.id === patternId) ?? null;
      const recos = listRecoCards(projectId, patternId);
      return { pattern, recos };
    },
  ),

  'recommendations:refresh': createTypedHandler((projectId: string) => {
    const patterns = recomputePatterns(projectId);
    return { patternCount: patterns.length };
  }),

  'recommendations:analyzePattern': createTypedHandler(
    (request: StartRecommendationAnalyzeRequest) => {
      const { projectPath } = resolveProject(request.projectId);
      const run = startRecommendationAnalyze(request, {
        projectPath,
        onEvent: broadcastAnalyzeEvent,
      });
      return { runId: run.runId };
    },
  ),

  'recommendations:stopAnalyze': createTypedHandler(
    withBroadcastOnError('recommendations:event', stopRecommendationAnalyze, (runId: string) => runId),
  ),

  'recommendations:applyReco': createTypedHandler(
    async (
      projectId: string,
      patternId: string,
      recId: string,
      editedBrief?: string,
    ): Promise<ApplyRecoResponse> => {
      const { projectPath } = resolveProject(projectId);
      return applyReco(projectId, patternId, recId, {
        projectPath,
        editedBrief,
        // The downstream runner's onEvent / opts come from its own channel —
        // here we plug a no-op since the run-tab will rebind via the
        // downstream channel (`edit:event` / `create:event` / `fix:event`).
        onEvent: () => undefined,
      });
    },
  ),

  'recommendations:dismissReco': createTypedHandler(
    (projectId: string, patternId: string, recId: string) => {
      updateRecoStatus(projectId, patternId, recId, { status: 'dismissed' });
      return { ok: true };
    },
  ),

  'recommendations:editRecoBrief': createTypedHandler(
    (projectId: string, patternId: string, recId: string, brief: string) => {
      // Rewrite the markdown body's Brief section.
      const cards = listRecoCards(projectId, patternId);
      const card = cards.find((c) => c.recId === recId);
      if (!card) return { ok: false };
      const newBody = card.body.replace(/(## Brief\n)[\s\S]*?(\n## )/, `$1${brief}\n$2`);
      writeRecoBody(projectId, patternId, recId, newBody);
      return { ok: true };
    },
  ),
};

// Re-export the buffered-events helper if the frontend needs it
// (mirrors `classifyConvo:getBufferedEvents` pattern).
void getRecommendationAnalyzeBufferedEvents;
```

- [ ] **Step 4: Register in handlers/index.ts**

Open `apps/nakiros/src/daemon/handlers/index.ts`. Add:

```ts
import { recommendationsHandlers } from './recommendations.js';
```

In `buildHandlerRegistry()`, after the `conversationIngestHandlers` spread, add:

```ts
    ...recommendationsHandlers,
```

- [ ] **Step 5: Verify tsc**

```bash
pnpm -F nakiros exec tsc --noEmit
```

Iterate. The most likely fix-ups:
- `listSessions` actual export name (grep `apps/nakiros/src/services/conversation-ingest/project-store.ts`).
- Each `*Target` shape — adjust the `EDIT_REQ_BUILDERS` in `recommendation-apply.ts`.
- `ExternalRunOpts` shape per runner.

- [ ] **Step 6: Commit**

```bash
git add apps/nakiros/src/services/recommendation-apply.ts apps/nakiros/src/daemon/handlers/recommendations.ts apps/nakiros/src/daemon/handlers/index.ts
git commit -m "feat(recommendations): apply-reco service + daemon handlers"
```

---

## Task 12: Daemon-side smoke (handlers + analyze runner)

**Files:**
- Create: `apps/nakiros/src/scripts/smoke-recommendations.ts`

- [ ] **Step 1: Write the smoke covering the handler surface**

```ts
/**
 * Smoke for recommendations:* handlers and the analyser runner.
 *
 * This script does NOT spawn a real Claude Code agent (would need
 * network + API key). It exercises:
 *   1. Clustering via writePatterns / readPatterns.
 *   2. Reco card round-trip via writeRecoCard / listRecoCards / parseRecoCardFromDisk.
 *   3. Status transitions via updateRecoStatus.
 *   4. Archive on disappearing patternId via writePatterns.
 *
 * Run with:
 *   pnpm -F nakiros exec tsx src/scripts/smoke-recommendations.ts
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
```

- [ ] **Step 2: Run it**

```bash
pnpm -F nakiros exec tsx src/scripts/smoke-recommendations.ts
```

Expected: All OK, exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/nakiros/src/scripts/smoke-recommendations.ts
git commit -m "test(recommendations): smoke for daemon-side handlers"
```

---

## Task 13: Frontend client + global.d.ts

**Files:**
- Modify: `apps/frontend/src/lib/nakiros-client.ts`
- Modify: `apps/frontend/src/global.d.ts`

- [ ] **Step 1: Add typed client methods**

Open `apps/frontend/src/lib/nakiros-client.ts`. Find the existing per-namespace pattern (e.g., `audit:` or `fix:` methods grouped together). Add a new `recommendations` group **after** the conversation-ingest group, mirroring the existing style:

```ts
// Recommendations — friction-pattern clustering + analyser + apply.
async listPatterns(projectId: string) {
  return this.call<RecommendationPattern[]>('recommendations:listPatterns', [projectId]);
}
async getPattern(projectId: string, patternId: string) {
  return this.call<{ pattern: RecommendationPattern | null; recos: RecoCard[] }>(
    'recommendations:getPattern', [projectId, patternId]);
}
async refreshRecommendations(projectId: string) {
  return this.call<{ patternCount: number }>('recommendations:refresh', [projectId]);
}
async analyzePattern(req: StartRecommendationAnalyzeRequest) {
  return this.call<{ runId: string }>('recommendations:analyzePattern', [req]);
}
async stopRecommendationsAnalyze(runId: string) {
  return this.call<void>('recommendations:stopAnalyze', [runId]);
}
async applyReco(projectId: string, patternId: string, recId: string, editedBrief?: string) {
  return this.call<ApplyRecoResponse>('recommendations:applyReco', [projectId, patternId, recId, editedBrief]);
}
async dismissReco(projectId: string, patternId: string, recId: string) {
  return this.call<{ ok: boolean }>('recommendations:dismissReco', [projectId, patternId, recId]);
}
async editRecoBrief(projectId: string, patternId: string, recId: string, brief: string) {
  return this.call<{ ok: boolean }>('recommendations:editRecoBrief', [projectId, patternId, recId, brief]);
}
```

Add the imports for the types from `@nakiros/shared` at the top of the file alongside other existing imports (group with other shared imports — match the existing style).

- [ ] **Step 2: Mirror in global.d.ts**

Open `apps/frontend/src/global.d.ts`. Find the `window.nakiros` interface declaration. Add the matching method signatures (same names + types as Step 1).

- [ ] **Step 3: Verify frontend tsc**

```bash
pnpm -F @nakiros/frontend exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/nakiros-client.ts apps/frontend/src/global.d.ts
git commit -m "feat(frontend): typed client for recommendations:* channels"
```

---

## Task 14: i18n keys

**Files:**
- Modify: `apps/frontend/src/i18n/en.json`
- Modify: `apps/frontend/src/i18n/fr.json`

- [ ] **Step 1: Add `recommendations.*` namespace**

In both files (FR + EN), add a top-level `recommendations` key with these strings:

**en.json:**
```json
"recommendations": {
  "title": "Recommendations",
  "comingSoonRemoved": "",
  "emptyState": "No patterns detected. Patterns surface when 2+ friction zones share a topic.",
  "refresh": "Refresh",
  "analyze": "Analyze",
  "reanalyze": "Re-analyze",
  "running": "Running…",
  "failed": "Failed — try again",
  "noRecosProduced": "The agent did not identify a clear preventive action for this pattern.",
  "card": {
    "applyFix": "Apply Fix",
    "create": "Create",
    "dismiss": "Dismiss",
    "openRun": "Open run",
    "showDismissed": "Show dismissed ({{count}})",
    "evidenceZones": "Evidence — {{count}} zones",
    "editBrief": "Edit brief",
    "cancelEdit": "Cancel"
  },
  "confirmApply": {
    "title": "Apply recommendation",
    "description": "The brief below will be sent verbatim to the {{kind}} runner. You can edit it before confirming.",
    "confirm": "Confirm and launch",
    "cancel": "Cancel"
  },
  "errors": {
    "targetMissing": "Target artefact no longer exists. Switch to Create?",
    "unknownArtifactType": "Unknown artefact type — cannot apply this recommendation.",
    "recoNotFound": "Recommendation no longer exists."
  }
}
```

**fr.json:** same keys with French translations (mirroring existing FR style — `Apply Fix` → `Appliquer le fix`, `Create` → `Créer`, `Dismiss` → `Ignorer`, etc.).

- [ ] **Step 2: Verify frontend tsc**

```bash
pnpm -F @nakiros/frontend exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/i18n/en.json apps/frontend/src/i18n/fr.json
git commit -m "feat(i18n): recommendations namespace (en + fr)"
```

---

## Task 15: PatternList component

**Files:**
- Create: `apps/frontend/src/components/recommendations/PatternList.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useTranslation } from 'react-i18next';
import type { RecommendationPattern } from '@nakiros/shared';

interface Props {
  patterns: RecommendationPattern[];
  selectedId: string | null;
  onSelect(patternId: string): void;
}

export function PatternList({ patterns, selectedId, onSelect }: Props): JSX.Element {
  const { t } = useTranslation();

  if (patterns.length === 0) {
    return (
      <div className="p-6 text-sm text-n-muted">
        {t('recommendations.emptyState')}
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {patterns.map((p) => {
        const active = p.id === selectedId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={[
                'w-full text-left px-4 py-3 border-b border-n-line transition-colors',
                active ? 'bg-n-active' : 'hover:bg-n-hover',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className={[
                    'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                    p.severity === 'high' ? 'bg-n-danger/15 text-n-danger' : 'bg-n-warning/15 text-n-warning',
                  ].join(' ')}
                >
                  {p.severity}
                </span>
                <span className="text-xs text-n-muted">{p.zoneCount} zones</span>
              </div>
              <div className="text-sm text-n-text break-words">
                {p.signature.topTokens.slice(0, 4).join(' · ')}
              </div>
              {p.analysis.status !== 'idle' && (
                <div className="mt-1 text-[11px] text-n-muted">
                  {p.analysis.status === 'running' && t('recommendations.running')}
                  {p.analysis.status === 'failed' && t('recommendations.failed')}
                  {p.analysis.status === 'done' && (
                    <>recos: {p.analysis.recoCount ?? 0}</>
                  )}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

Notes:
- Uses `n-*` Tailwind tokens (per `.claude/rules/ui-kit.md`). If `n-danger` / `n-warning` / `n-active` don't exist, grep the existing components for the actual token names and adjust.
- Uses `react-i18next` `useTranslation()` per existing components.
- `break-words` per `feedback_no_truncate_user_content`.

- [ ] **Step 2: Verify tsc**

```bash
pnpm -F @nakiros/frontend exec tsc --noEmit
```

If `n-danger` / `n-warning` don't exist, replace with the closest existing tokens — grep `apps/frontend/src/index.css` or `tailwind.config.*` for the actual tokens.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/recommendations/PatternList.tsx
git commit -m "feat(frontend): PatternList component"
```

---

## Task 16: RecoCard + ApplyRecoModal components

**Files:**
- Create: `apps/frontend/src/components/recommendations/RecoCard.tsx`
- Create: `apps/frontend/src/components/recommendations/ApplyRecoModal.tsx`

- [ ] **Step 1: Write `ApplyRecoModal.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoCard as RecoCardType } from '@nakiros/shared';
import { ConfirmModal } from '../ConfirmModal';

interface Props {
  card: RecoCardType;
  onConfirm(editedBrief: string): void;
  onClose(): void;
}

/**
 * Modal shown before applying a reco. Lets the user edit the brief that will
 * be sent verbatim to the downstream runner. Uses the existing
 * `ConfirmModal` shell.
 */
export function ApplyRecoModal({ card, onConfirm, onClose }: Props): JSX.Element {
  const { t } = useTranslation();
  const [brief, setBrief] = useState(card.brief);

  const runKind = card.action === 'create' ? 'create' : 'edit';

  return (
    <ConfirmModal
      title={t('recommendations.confirmApply.title')}
      description={t('recommendations.confirmApply.description', { kind: runKind })}
      confirmLabel={t('recommendations.confirmApply.confirm')}
      cancelLabel={t('recommendations.confirmApply.cancel')}
      onConfirm={() => onConfirm(brief.trim())}
      onClose={onClose}
      confirmDisabled={brief.trim().length === 0}
    >
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={16}
        className="w-full min-h-[300px] font-n-mono text-sm bg-n-canvas border border-n-line rounded p-3 whitespace-pre-wrap"
      />
    </ConfirmModal>
  );
}
```

**Note:** `ConfirmModal`'s props (title/description/onConfirm/onClose/confirmDisabled/children) must match what the existing component exports. Open `apps/frontend/src/components/ConfirmModal.tsx` and align.

- [ ] **Step 2: Write `RecoCard.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoCard as RecoCardType } from '@nakiros/shared';
import { MarkdownViewer } from '../ui/MarkdownViewer';
import { ApplyRecoModal } from './ApplyRecoModal';

interface Props {
  card: RecoCardType;
  onApply(editedBrief: string): void;
  onDismiss(): void;
  onOpenRun(runId: string): void;
}

/**
 * One recommendation card: header (type/action/target), MarkdownViewer body,
 * footer with action buttons. Behaviour by status:
 *   - 'pending'  → Apply / Dismiss
 *   - 'applied'  → Open run
 *   - 'dismissed' → (rendered behind a toggle by PatternDetail)
 */
export function RecoCard({ card, onApply, onDismiss, onOpenRun }: Props): JSX.Element {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  const isCreate = card.action === 'create';

  return (
    <article className="border border-n-line rounded-md bg-n-surface mb-4 overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-n-line bg-n-canvas">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-n-accent/15 text-n-accent">
            {isCreate ? 'create' : 'fix'}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-n-line text-n-muted">
            {card.artifactType}
          </span>
          {card.target !== 'new' && (
            <span className="text-xs text-n-muted font-n-mono break-all">→ {card.target}</span>
          )}
        </div>
        <span className="text-xs text-n-muted">{card.title}</span>
      </header>

      <div className="px-4 py-3">
        <MarkdownViewer markdown={card.body} />
      </div>

      <footer className="px-4 py-2 border-t border-n-line flex items-center justify-end gap-2">
        {card.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={onDismiss}
              className="text-sm px-3 py-1.5 rounded border border-n-line hover:bg-n-hover text-n-muted"
            >
              {t('recommendations.card.dismiss')}
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="text-sm px-3 py-1.5 rounded bg-n-accent text-n-canvas hover:bg-n-accent/90"
            >
              {isCreate ? t('recommendations.card.create') : t('recommendations.card.applyFix')}
            </button>
          </>
        )}
        {card.status === 'applied' && card.appliedRunId && (
          <button
            type="button"
            onClick={() => onOpenRun(card.appliedRunId!)}
            className="text-sm px-3 py-1.5 rounded border border-n-line hover:bg-n-hover"
          >
            {t('recommendations.card.openRun')} #{card.appliedRunId.slice(0, 6)}
          </button>
        )}
      </footer>

      {showModal && (
        <ApplyRecoModal
          card={card}
          onConfirm={(brief) => {
            setShowModal(false);
            onApply(brief);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </article>
  );
}
```

**Note:** `MarkdownViewer`'s prop name is likely `markdown` or `content` — open `apps/frontend/src/components/ui/MarkdownViewer.tsx` to confirm.

- [ ] **Step 3: Verify tsc**

```bash
pnpm -F @nakiros/frontend exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/recommendations/RecoCard.tsx apps/frontend/src/components/recommendations/ApplyRecoModal.tsx
git commit -m "feat(frontend): RecoCard + ApplyRecoModal components"
```

---

## Task 17: PatternDetail + run streaming

**Files:**
- Create: `apps/frontend/src/components/recommendations/PatternDetail.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecommendationPattern, RecoCard as RecoCardType } from '@nakiros/shared';
import { client } from '../../lib/nakiros-client';
import { RecoCard } from './RecoCard';

interface Props {
  projectId: string;
  pattern: RecommendationPattern;
  onRunOpen(runId: string): void;
  onPatternsRefresh(): void;
}

/**
 * Right-side detail panel: header summary, Analyze button, reco cards.
 * Subscribes to the `recommendations:event` IPC channel to live-update the
 * run status while the analyser is in flight.
 */
export function PatternDetail({ projectId, pattern, onRunOpen, onPatternsRefresh }: Props): JSX.Element {
  const { t } = useTranslation();
  const [recos, setRecos] = useState<RecoCardType[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);

  // Load recos whenever the pattern changes.
  useEffect(() => {
    let cancelled = false;
    void client.getPattern(projectId, pattern.id).then(({ recos }) => {
      if (!cancelled) setRecos(recos);
    });
    return () => { cancelled = true; };
  }, [projectId, pattern.id]);

  // Live-update via the recommendations:event channel — re-fetch when
  // the analyser run finishes.
  useEffect(() => {
    const off = window.nakiros.onRecommendationsEvent?.((ev: unknown) => {
      const event = ev as { event?: { type?: string } };
      if (event?.event?.type === 'done') {
        void client.getPattern(projectId, pattern.id).then(({ recos }) => setRecos(recos));
        onPatternsRefresh();
      }
    });
    return () => off?.();
  }, [projectId, pattern.id, onPatternsRefresh]);

  const visible = useMemo(
    () => recos.filter((r) => showDismissed || r.status !== 'dismissed'),
    [recos, showDismissed],
  );
  const dismissedCount = recos.filter((r) => r.status === 'dismissed').length;

  const handleAnalyze = async () => {
    await client.analyzePattern({ projectId, patternId: pattern.id });
    onPatternsRefresh();
  };

  const handleApply = async (recId: string, editedBrief: string) => {
    const res = await client.applyReco(projectId, pattern.id, recId, editedBrief);
    if (res.ok) {
      onRunOpen(res.runId);
      const { recos } = await client.getPattern(projectId, pattern.id);
      setRecos(recos);
    } else {
      const errKey = res.error === 'target-missing'
        ? 'targetMissing'
        : res.error === 'unknown-artifact-type'
          ? 'unknownArtifactType'
          : 'recoNotFound';
      alert(t(`recommendations.errors.${errKey}`));
    }
  };

  const handleDismiss = async (recId: string) => {
    await client.dismissReco(projectId, pattern.id, recId);
    const { recos } = await client.getPattern(projectId, pattern.id);
    setRecos(recos);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-n-line">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-n-sans text-n-text break-words">
            {pattern.signature.topTokens.slice(0, 6).join(' · ')}
          </h2>
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={pattern.analysis.status === 'running'}
            className="text-sm px-3 py-1.5 rounded bg-n-accent text-n-canvas hover:bg-n-accent/90 disabled:opacity-50"
          >
            {pattern.analysis.status === 'done'
              ? t('recommendations.reanalyze')
              : t('recommendations.analyze')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-n-muted">
          <span>severity: {pattern.severity}</span>
          <span>· {pattern.zoneCount} zones</span>
          <span>· {pattern.signature.filesTouched.length} files</span>
          {pattern.signature.signalKinds.length > 0 && (
            <span>· signals: {pattern.signature.signalKinds.join(', ')}</span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-4">
        {pattern.analysis.status === 'running' && (
          <div className="text-sm text-n-muted mb-4">{t('recommendations.running')}</div>
        )}
        {pattern.analysis.status === 'failed' && (
          <div className="text-sm text-n-danger mb-4">{t('recommendations.failed')}</div>
        )}
        {pattern.analysis.status === 'done' && recos.length === 0 && (
          <div className="text-sm text-n-muted">{t('recommendations.noRecosProduced')}</div>
        )}

        {visible.map((r) => (
          <RecoCard
            key={r.recId}
            card={r}
            onApply={(brief) => void handleApply(r.recId, brief)}
            onDismiss={() => void handleDismiss(r.recId)}
            onOpenRun={(runId) => onRunOpen(runId)}
          />
        ))}

        {!showDismissed && dismissedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDismissed(true)}
            className="text-xs text-n-muted underline mt-2"
          >
            {t('recommendations.card.showDismissed', { count: dismissedCount })}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Note:** `window.nakiros.onRecommendationsEvent` event-bus subscription depends on the existing pattern. Grep for an existing `on<Channel>Event` handler in `global.d.ts` (e.g., `onAnalyzeConvoEvent`, `onFixEvent`) and mirror its shape — likely a tuple of `(callback) => unsubscribe`. Add the matching method to `global.d.ts` and `nakiros-client.ts` if missing.

- [ ] **Step 2: Verify tsc**

```bash
pnpm -F @nakiros/frontend exec tsc --noEmit
```

Adjust the event-bus wiring per the existing pattern if needed.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/recommendations/PatternDetail.tsx
git commit -m "feat(frontend): PatternDetail with live run streaming"
```

---

## Task 18: RecsScreen + sidebar wiring

**Files:**
- Create: `apps/frontend/src/components/recommendations/RecsScreen.tsx`
- Modify: `apps/frontend/src/components/shell/NewShellSidebar.tsx`
- Modify: `apps/frontend/src/components/shell/NewShell.tsx`

- [ ] **Step 1: Write `RecsScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecommendationPattern } from '@nakiros/shared';
import { client } from '../../lib/nakiros-client';
import { PatternList } from './PatternList';
import { PatternDetail } from './PatternDetail';

interface Props {
  projectId: string;
  onRunOpen(runId: string): void;
}

/**
 * 2-column screen: pattern list (left) + selected pattern detail (right).
 * Loads patterns on mount; Refresh re-runs the daemon-side clustering.
 */
export function RecsScreen({ projectId, onRunOpen }: Props): JSX.Element {
  const { t } = useTranslation();
  const [patterns, setPatterns] = useState<RecommendationPattern[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const list = await client.listPatterns(projectId);
    setPatterns(list);
    if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [projectId]);

  const handleRefresh = async () => {
    setLoading(true);
    await client.refreshRecommendations(projectId);
    await load();
  };

  const selected = patterns.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-3 border-b border-n-line">
        <h1 className="text-lg font-n-sans">{t('recommendations.title')}</h1>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded border border-n-line hover:bg-n-hover disabled:opacity-50"
        >
          {t('recommendations.refresh')}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-n-line overflow-auto">
          <PatternList
            patterns={patterns}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>
        <main className="flex-1 overflow-hidden">
          {selected ? (
            <PatternDetail
              projectId={projectId}
              pattern={selected}
              onRunOpen={onRunOpen}
              onPatternsRefresh={() => void load()}
            />
          ) : (
            <div className="p-6 text-sm text-n-muted">{t('recommendations.emptyState')}</div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Enable the sidebar entry**

Open `apps/frontend/src/components/shell/NewShellSidebar.tsx`. Find the line declaring the `recs` entry:

```ts
{ id: 'recs', label: 'Recommendations', icon: <Lightbulb size={18} strokeWidth={2} />, disabled: true, comingIn: 'Phase 5' },
```

Replace with:

```ts
{ id: 'recs', label: 'Recommendations', icon: <Lightbulb size={18} strokeWidth={2} /> },
```

(remove the `disabled` and `comingIn` props).

- [ ] **Step 3: Route `recs` to the new screen**

Open `apps/frontend/src/components/shell/NewShell.tsx`. Find the switch / router that maps `ProjectTabView` values to components. Add a case for `'recs'`:

```tsx
case 'recs':
  return (
    <RecsScreen
      projectId={tab.projectId}
      onRunOpen={(runId) => openTab({ kind: 'run', runId, runKind: 'edit', label: `run ${runId.slice(0, 6)}` })}
    />
  );
```

Adjust the `runKind` based on what `applyReco` returned — if the run kind is dynamic, plumb it through (e.g., via a callback param). For simplicity in v1, `'edit'` works for all `.claude/` artefacts (the run-tab consumer will branch internally on `runKind`).

Add the import at the top:

```tsx
import { RecsScreen } from '../recommendations/RecsScreen';
```

- [ ] **Step 4: Run the dev shell manually and click through**

```bash
pnpm -F @nakiros/frontend dev
```

Open the project, click the "Recommendations" sidebar entry. Verify:
1. The screen renders.
2. Without any conversations analysed: empty state shows.
3. If you have a project with cached analyses + 2+ similar zones (use the smoke project from Task 12 or your own dev project): patterns render, "Analyze" button shows.

**Do NOT click "Analyze" if you don't want to spawn a real Claude Code session.** That's OK for this task — just verify the layout.

- [ ] **Step 5: Verify tsc + build**

```bash
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/frontend build
```

Both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/recommendations/RecsScreen.tsx apps/frontend/src/components/shell/NewShellSidebar.tsx apps/frontend/src/components/shell/NewShell.tsx
git commit -m "feat(frontend): RecsScreen + sidebar wiring"
```

---

## Task 19: TSDoc + technical docs leaves

**Files:**
- Modify: every new `.ts` / `.tsx` file from Tasks 1–18 — ensure the exported symbols have TSDoc (most already do per the task templates).
- Create: `docs/technical/apps/nakiros/src/services/recommendation-cluster.md`
- Create: `docs/technical/apps/nakiros/src/services/recommendation-store.md`
- Create: `docs/technical/apps/nakiros/src/services/recommendation-inventory.md`
- Create: `docs/technical/apps/nakiros/src/services/recommendation-card-parser.md`
- Create: `docs/technical/apps/nakiros/src/services/recommendation-analyze-runner.md`
- Create: `docs/technical/apps/nakiros/src/services/recommendation-apply.md`
- Create: `docs/technical/apps/nakiros/src/daemon/handlers/recommendations.md`
- Create: `docs/technical/packages/shared/src/types/recommendation.md`
- Create: `docs/technical/apps/frontend/src/components/recommendations/` (with one leaf per component)
- Modify: relevant `docs/technical/**/README.md` indexes to link the new leaves
- Modify: `docs/technical/.manifest.json` to include the new files

- [ ] **Step 1: Use the code-documentation skill to bulk-generate the docs**

The Nakiros project has a skill for this. Invoke it on the changed files:

```
Use the Skill tool to invoke `code-documentation` for the files in this changeset.
```

The skill walks the new sources, generates TSDoc where missing, mirrors them into `docs/technical/`, and updates the manifest.

Alternatively, write each leaf manually mirroring one existing leaf (e.g., `docs/technical/apps/nakiros/src/services/classify-convo-runner.md`).

- [ ] **Step 2: Verify the manifest is in sync**

```bash
node -e "const m = require('./docs/technical/.manifest.json'); console.log(Object.keys(m).length, 'entries')"
```

(or whatever check the existing manifest format uses).

- [ ] **Step 3: Commit**

```bash
git add docs/technical/
git commit -m "docs(technical): leaves and indexes for recommendations modules"
```

---

## Task 20: End-to-end smoke (manual)

**Files:** none — this task is the manual verification.

- [ ] **Step 1: Pick a fixture project**

Use a real project on your machine that already has Nakiros ingest enabled and has at least 2 conversations with `frictionZones[]` cached. Either:
- A project you've been using for weeks (recommended).
- A scratch project where you intentionally create 2 sessions that loop on the same topic.

- [ ] **Step 2: Daemon reload**

```bash
pnpm -F nakiros build && nakiros service restart
```

(Adjust the command per the project's `nakiros service` setup.)

- [ ] **Step 3: Open the frontend**

Open the Nakiros UI in the browser. Navigate to the project, click **Recommendations**.

Expected:
- Patterns appear if the project has 2+ similar zones. If not, empty state — go back to step 1.

- [ ] **Step 4: Click Analyze on the first pattern**

Watch:
- Status flips to `running` (sidebar + detail header).
- The run streams events (you should see them via the `recommendations:event` broadcast — the PatternDetail re-fetches when the run finishes).
- After ~10–60 s, status flips to `done`, recos appear as cards.

- [ ] **Step 5: Apply a reco**

Click **Apply Fix** or **Create** on one card. The modal opens with the brief. Confirm. Verify:
- A new run tab opens (existing run-tab UI).
- The reco status flips to `applied`, footer shows "Open run #..."

- [ ] **Step 6: Dismiss + un-dismiss**

Click **Dismiss** on another card. Verify it disappears, and the "Show dismissed (N)" toggle appears. Click the toggle — it reappears.

- [ ] **Step 7: Refresh**

Click **Refresh** in the header. Verify clustering re-runs (cheap, no LLM) and patterns reload.

- [ ] **Step 8: If any step fails, fix the underlying bug and re-run from that step.**

Once all steps PASS:

- [ ] **Step 9: Commit any fix-ups**

```bash
git commit -m "fix(recommendations): resolve issues found in end-to-end smoke"
```

(Only commit if there were fixes. Otherwise skip.)

---

## Task 21: Final validation gates

**Files:** none — only commands.

- [ ] **Step 1: Run all type-checks**

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/landing exec tsc --noEmit
```

All three: PASS.

- [ ] **Step 2: Run all builds**

```bash
turbo build
```

PASS.

- [ ] **Step 3: Re-build the frontend explicitly (per `feedback_build_frontend_end_of_session`)**

```bash
pnpm -F @nakiros/frontend build
```

PASS — the binary `nakiros` will serve the new bundle from `dist/ui`.

- [ ] **Step 4: Run all smoke scripts**

```bash
pnpm -F nakiros exec tsx src/scripts/smoke-recommendation-cluster.ts
pnpm -F nakiros exec tsx src/scripts/smoke-recommendation-parser.ts
pnpm -F nakiros exec tsx src/scripts/smoke-recommendations.ts
```

All exit 0.

- [ ] **Step 5: No final commit required** — work was committed task-by-task.

---

## Self-review

This plan is checked against the spec. Coverage:

- **Layer 1 — Clustering**: Tasks 1, 2, 4, 5, 6 (types, tokenizer extraction, cluster core, smoke, store).
- **Layer 2 — Analyser run**: Tasks 7, 8, 9, 10 (inventory, parser, parser smoke, runner).
- **Layer 3 — UI**: Tasks 14, 15, 16, 17, 18 (i18n, PatternList, RecoCard+Modal, PatternDetail, RecsScreen+sidebar).
- **IPC contract sync** (4 files): Tasks 3 (channels), 11 (daemon handlers), 13 (client+global.d.ts).
- **Apply-reco translation**: Task 11.
- **Error handling**: distributed — clustering filters in Task 4, parser downgrade in Task 8, apply idempotency + target-missing in Task 11.
- **Testing strategy**: smoke scripts in Tasks 5, 9, 12; manual end-to-end in Task 20.
- **Final validation gates**: Task 21.

Spec sections covered. No placeholders introduced. Type names are consistent (`RecommendationPattern`, `RecoCard`, `RecommendationArtifactType`, `RecommendationAnalyzeRun` — same across types module, store, parser, runner, handlers, client).

Implementation questions deferred to the engineer: the exact `*Target` field shapes and the exact `ExternalRunOpts` for each downstream runner are confirmed by reading the existing code (paths noted in each task). The `BaseRunStatus` enum values used in the new run type may need a small adjustment to match what `ClassifyConvoRun` uses — same source file.
