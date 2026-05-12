# Sentiment Pre-pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an isolated local sentiment-scoring brick (`@xenova/transformers` + distilbert multilingual) that enriches the conversation ingest pipeline with a `sentimentTrace` and exposes it as a track in the frontend sismograph — without touching the V1.1 friction classifier.

**Architecture:** A new `apps/nakiros/src/services/sentiment/` module exposes a singleton ONNX pipeline (lazy-loaded, model cached under `~/.nakiros/models/`). The conversation-ingest runner calls it after persisting a session body, writes a `<sid>.json` file under `projects/<encoded>/sentiment/`, and broadcasts a new IPC event. The frontend reads it via a new daemon handler and overlays a sentiment track on the sismograph.

**Tech Stack:** Node 20 ESM, TypeScript, `@xenova/transformers` v2.x, `onnxruntime-node`, pnpm 10 monorepo, tsup build, React/Tailwind frontend (new-design).

---

## Design deviations from spec

Two small refinements vs the 2026-05-12 spec, made after reading the codebase:

1. **`sentimentTrace` is NOT merged into the existing digest JSON.** The digest in `~/.nakiros/ingest/projects/<encoded>/digests/<sid>.json` is the V1.1 classifier output (`ConversationDigest`), not a free-form envelope. The spec's "brique isolée" principle is better served by a separate file at `~/.nakiros/ingest/projects/<encoded>/sentiment/<sid>.json` keyed by sessionId. Same parallel layout as `sessions/` and `digests/`.
2. **No vitest setup.** The project has no JS test framework today (`/Users/thomasailleaume/Perso/timetrackerAgent/apps/nakiros` ships behaviorally via POC scripts + `tsc --noEmit` + `turbo build`). The plan validates the sentiment service via the POC and inline type checks, not via a new test runner. Adding vitest is out of scope.

---

## File map

**Create:**
- `apps/nakiros/src/services/sentiment/index.ts` — public façade (`scoreText`, `scoreBatch`, `warmup`)
- `apps/nakiros/src/services/sentiment/pipeline.ts` — singleton pipeline loader
- `apps/nakiros/src/services/sentiment/skip-rules.ts` — code-paste filter
- `apps/nakiros/src/services/sentiment/sentiment-store.ts` — persist/load sentiment traces
- `apps/nakiros/src/services/sentiment/paths.ts` — `~/.nakiros/models/` + `<encoded>/sentiment/<sid>.json`
- `apps/nakiros/src/daemon/handlers/sentiment.ts` — IPC handler `sentiment:getTrace`
- `packages/shared/src/types/sentiment.ts` — `SentimentLabel`, `SentimentEntry`, `SentimentTrace`
- `apps/frontend/src/lib/sentiment-api.ts` — frontend client wrapper

**Modify:**
- `apps/nakiros/package.json` — add `@xenova/transformers` to `dependencies`
- `apps/nakiros/src/services/conversation-ingest/runner.ts` — call sentiment scoring after `ingestSession` persists a session body
- `apps/nakiros/src/services/conversation-ingest/index.ts` — re-export sentiment helpers if needed by other services
- `apps/nakiros/src/daemon/server.ts` — register `sentiment:getTrace` IPC handler
- `packages/shared/src/types/index.ts` — re-export sentiment types
- `packages/shared/src/ipc-channels.ts` (or equivalent) — add `sentiment:getTrace`, `sentiment:progress`
- `apps/nakiros/scripts/sentiment-poc.mjs` — rewrite (clean import, correct model)
- `apps/frontend/src/lib/nakiros-client.ts` — wire IPC call
- `apps/frontend/src/global.d.ts` — type the new handler
- Sismograph component in `apps/frontend/src/views/ProjectOverviewScreen.tsx` or the dedicated sismograph file — add a sentiment track

**Cleanup at end:**
- 2 orphan digests under `~/.nakiros/ingest/projects/timetrackerAgent-1c4f9291/digests/06ff8665-*.json` + `b4d9ebd5-*.json` (noted in `project_nakiros_classify_convo_v1_1_status_2026_05_03`) — out of scope, do not delete.

---

## Phase 0 — Branch setup

### Task 0.1: Create feature branch

**Files:** none

- [ ] **Step 1: Confirm `main` is clean**

```bash
git status
```
Expected: only the spec/plan commits ahead, no uncommitted changes that don't belong to this work.

- [ ] **Step 2: Create and check out the branch**

```bash
git checkout -b feat/sentiment-prepass
```
Expected: `Switched to a new branch 'feat/sentiment-prepass'`.

- [ ] **Step 3: Verify**

```bash
git branch --show-current
```
Expected: `feat/sentiment-prepass`.

---

## Phase 1 — Clean install of `@xenova/transformers`

### Task 1.1: Add the dependency cleanly

**Files:**
- Modify: `apps/nakiros/package.json`

- [ ] **Step 1: Add the dep to `apps/nakiros`**

```bash
pnpm add @xenova/transformers --filter @nakirosai/nakiros
```
Expected: `@xenova/transformers` appears in `apps/nakiros/package.json` under `"dependencies"` (not devDependencies). `pnpm-lock.yaml` updates. `onnxruntime-node` should be pulled transitively.

- [ ] **Step 2: Verify the lib resolves with a normal ESM import**

```bash
cd apps/nakiros && node -e "import('@xenova/transformers').then(m => console.log('OK', Object.keys(m).slice(0,5)))" 2>&1 | head -20
```
Expected: `OK [ 'AutoConfig', 'AutoModel', 'AutoModelForCausalLM', 'AutoModelForImageClassification', 'AutoModelForImageSegmentation' ]` (or similar). NO `MODULE_NOT_FOUND`, NO native binary errors.

If it fails on Mac ARM64 with an `onnxruntime-node` native binding error: explicitly add `onnxruntime-node` as a peer dep, or set pnpm `node-linker=hoisted` for this package. Document whichever workaround in a comment in `apps/nakiros/package.json`.

- [ ] **Step 3: Commit**

```bash
git add apps/nakiros/package.json pnpm-lock.yaml
git commit -m "feat(sentiment): add @xenova/transformers dependency"
```

### Task 1.2: Rewrite the POC

**Files:**
- Modify: `apps/nakiros/scripts/sentiment-poc.mjs`

The existing POC uses a hardcoded import path and the wrong model. Replace it with a clean ESM import and the validated model.

- [ ] **Step 1: Replace the import block (lines 17-38)**

Open `apps/nakiros/scripts/sentiment-poc.mjs`. Delete lines 17-38 (the createRequire + workspaceRoot + dynamic import dance). Replace with:

```js
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { pipeline, env } from '@xenova/transformers';
```

- [ ] **Step 2: Change the model id**

Find `const MODEL_ID = 'tabularisai/multilingual-sentiment-analysis';` and replace with:

```js
const MODEL_ID = 'Xenova/distilbert-base-multilingual-cased-sentiments-student';
```

Also update the directory name in `dirSize(join(modelCacheDir, 'tabularisai'))` (two occurrences) to `dirSize(join(modelCacheDir, 'Xenova'))`.

- [ ] **Step 3: Add a `package.json` script for the POC**

Edit `apps/nakiros/package.json`, in the `"scripts"` block add:

```json
"sentiment-poc": "node scripts/sentiment-poc.mjs"
```

- [ ] **Step 4: Run the POC**

```bash
pnpm -F @nakirosai/nakiros sentiment-poc
```
Expected (first run): downloads ~70MB of model files into `~/.nakiros/models/Xenova/distilbert-base-multilingual-cased-sentiments-student/`, runs cold start in < 5s, scores every user message in the longest local session, prints the results table and the label distribution.

If the run crashes, do **not** patch the script with hardcoded paths. Diagnose the install issue (Task 1.1 step 2) instead.

- [ ] **Step 5: Re-run to confirm warm cache**

```bash
pnpm -F @nakirosai/nakiros sentiment-poc
```
Expected: `Download this run: 0B`. Cold start should still be sub-second on subsequent runs since the model is cached.

- [ ] **Step 6: Commit**

```bash
git add apps/nakiros/scripts/sentiment-poc.mjs apps/nakiros/package.json
git commit -m "feat(sentiment): rewrite POC with clean import and validated model"
```

---

## Phase 2 — Gate 1: POC validation (USER CHECKPOINT)

### Task 2.1: Validate the POC against the spec gates

**Files:** none — manual review

- [ ] **Step 1: Capture POC output for at least 3 conversations**

Pick 3-5 sessions from `~/.claude/projects/-Users-thomasailleaume-Perso-timetrackerAgent/*.jsonl` (the POC auto-picks the largest, but rerun with different `JSONL_PATH` overrides if needed). Save the outputs.

- [ ] **Step 2: Check each gate**

Compare against the spec:

| Gate | How to check |
|---|---|
| Qualité labels ≥ 80% | Manually scan ~20 user messages per conv; count Negative-flagged frustration vs missed |
| 0 faux positifs code | Verify the `SKIP` column matches actual code-paste messages |
| Cold start < 5s | Read POC "Cold start" line |
| Inférence < 100ms/msg | Read POC "Avg inference" line |
| RSS < 500MB | Read POC "RSS after model load" line |
| Robustesse | No crashes, no `ERROR` rows |

- [ ] **Step 3: User decision**

Hand off to user: "POC validated against gates. Proceed to Phase 3 (integration)?" If gates fail, stop here and re-cadrer.

---

## Phase 3 — Sentiment service modules

### Task 3.1: Shared types

**Files:**
- Create: `packages/shared/src/types/sentiment.ts`
- Modify: `packages/shared/src/types/index.ts` (re-export)

- [ ] **Step 1: Create the types**

Create `packages/shared/src/types/sentiment.ts`:

```ts
/**
 * Local sentiment pre-pass output — produced by the `apps/nakiros/src/services/sentiment`
 * module after a session body is ingested. Persisted as one JSON file per session under
 * `~/.nakiros/ingest/projects/<encoded>/sentiment/<sessionId>.json`. Independent of the
 * V1.1 classifier output (`ConversationDigest`) so the brick stays isolated.
 */

export type SentimentLabel = 'Positive' | 'Neutral' | 'Negative';

export interface SentimentEntry {
  /** 1-indexed user-message position within the conversation (matches digest turn numbering). */
  messageIndex: number;
  /** Top-1 label produced by the multilingual distilbert sentiment model. */
  label: SentimentLabel;
  /** Model confidence in `[0, 1]` for the top-1 label. */
  score: number;
}

export interface SentimentTrace {
  sessionId: string;
  projectPath: string;
  /** ISO mtime of the source `.jsonl` when the trace was produced. Allows skip-on-unchanged. */
  transcriptMtime: string;
  /** ISO timestamp when the scoring finished. */
  generatedAt: string;
  /** HF model id used to generate the trace. */
  model: string;
  /** One entry per scored user message. Messages skipped by skip-rules are absent. */
  entries: SentimentEntry[];
  /** Total user messages observed in the session (including skipped). */
  observed: number;
  /** Number of messages skipped by skip-rules. */
  skipped: number;
}

export type SentimentTraceStatus = 'absent' | 'running' | 'ready' | 'failed';
```

- [ ] **Step 2: Re-export from the shared types barrel**

Find `packages/shared/src/types/index.ts` (or wherever the barrel lives — `grep -r "conversation-ingest" packages/shared/src/index.ts`). Add:

```ts
export * from './types/sentiment.js';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm -F @nakiros/shared exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/sentiment.ts packages/shared/src/types/index.ts packages/shared/src/index.ts 2>/dev/null
git commit -m "feat(sentiment): add SentimentTrace shared types"
```

### Task 3.2: Sentiment paths

**Files:**
- Create: `apps/nakiros/src/services/sentiment/paths.ts`

- [ ] **Step 1: Write the paths module**

```ts
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { nakirosFile } from '../../utils/nakiros-dir.js';
import { getProjectDir } from '../conversation-ingest/paths.js';

export const MODELS_SUBDIR = 'models';
export const SENTIMENT_SUBDIR = 'sentiment';

export function getModelsDir(): string {
  const dir = nakirosFile(MODELS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getProjectSentimentDir(projectPath: string): string {
  const dir = join(getProjectDir(projectPath), SENTIMENT_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSentimentTracePath(projectPath: string, sessionId: string): string {
  return join(getProjectSentimentDir(projectPath), `${sessionId}.json`);
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm -F @nakirosai/nakiros exec tsc --noEmit
git add apps/nakiros/src/services/sentiment/paths.ts
git commit -m "feat(sentiment): add paths module for models/ and sentiment/<sid>.json"
```

### Task 3.3: Skip rules

**Files:**
- Create: `apps/nakiros/src/services/sentiment/skip-rules.ts`

- [ ] **Step 1: Write the module**

```ts
/**
 * Decide whether a user message should be skipped by sentiment scoring.
 * Code pastes drown the multilingual model in tokens that don't carry user
 * affect — skip them to keep precision high and inference cheap.
 *
 * A message is skipped if any of the following is true:
 *   - empty or shorter than 5 characters;
 *   - contains a triple-backtick fenced block;
 *   - more than 40% non-alphabetic characters (counts unicode letters).
 */

const MIN_LENGTH = 5;
const NON_ALPHA_THRESHOLD = 0.4;

export function shouldSkipForSentiment(text: string): boolean {
  if (!text || text.length < MIN_LENGTH) return true;
  if (text.includes('```')) return true;
  const alpha = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  const nonAlphaRatio = (text.length - alpha) / text.length;
  return nonAlphaRatio > NON_ALPHA_THRESHOLD;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm -F @nakirosai/nakiros exec tsc --noEmit
git add apps/nakiros/src/services/sentiment/skip-rules.ts
git commit -m "feat(sentiment): add skip rules for code/short messages"
```

### Task 3.4: Singleton pipeline

**Files:**
- Create: `apps/nakiros/src/services/sentiment/pipeline.ts`

- [ ] **Step 1: Write the singleton**

```ts
import { pipeline, env, type Pipeline } from '@xenova/transformers';

import { getModelsDir } from './paths.js';

export const SENTIMENT_MODEL_ID =
  'Xenova/distilbert-base-multilingual-cased-sentiments-student';

let cached: Pipeline | null = null;
let pending: Promise<Pipeline> | null = null;

function configureEnv(): void {
  env.cacheDir = getModelsDir();
  env.allowRemoteModels = true;
  env.allowLocalModels = true;
}

/**
 * Returns the singleton text-classification pipeline. First call downloads the
 * model into `~/.nakiros/models/`; subsequent calls reuse the in-memory
 * instance. Concurrent calls during the initial load share the same promise.
 */
export async function getSentimentPipeline(): Promise<Pipeline> {
  if (cached) return cached;
  if (pending) return pending;
  configureEnv();
  pending = pipeline('text-classification', SENTIMENT_MODEL_ID, { quantized: true })
    .then((p) => {
      cached = p as Pipeline;
      pending = null;
      return cached;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm -F @nakirosai/nakiros exec tsc --noEmit
git add apps/nakiros/src/services/sentiment/pipeline.ts
git commit -m "feat(sentiment): add singleton @xenova/transformers pipeline"
```

### Task 3.5: Façade

**Files:**
- Create: `apps/nakiros/src/services/sentiment/index.ts`

- [ ] **Step 1: Write the façade**

```ts
import type { SentimentEntry, SentimentLabel } from '@nakiros/shared';

import { getSentimentPipeline, SENTIMENT_MODEL_ID } from './pipeline.js';
import { shouldSkipForSentiment } from './skip-rules.js';

export { SENTIMENT_MODEL_ID };
export { shouldSkipForSentiment } from './skip-rules.js';
export { getSentimentTracePath, getProjectSentimentDir } from './paths.js';

/**
 * Lazy-loads the pipeline and returns it ready for inference. Used by the
 * ingest runner to warm the model before scoring the first message of a
 * batch — keeps cold-start latency out of the per-message timing.
 */
export async function warmupSentiment(): Promise<void> {
  await getSentimentPipeline();
}

/**
 * Score a single text. Returns `null` if the text is skipped by skip-rules.
 * Throws on inference errors so the caller can decide to retry or drop the
 * trace entirely.
 */
export async function scoreText(
  text: string,
): Promise<{ label: SentimentLabel; score: number } | null> {
  if (shouldSkipForSentiment(text)) return null;
  const pipe = await getSentimentPipeline();
  const result = await pipe(text, { topk: 1 });
  const top = Array.isArray(result) ? result[0] : result;
  return {
    label: normalizeLabel(top?.label),
    score: typeof top?.score === 'number' ? top.score : 0,
  };
}

/**
 * Score a list of `{ messageIndex, text }` pairs in order. Skipped messages
 * are absent from the returned entries (no placeholder). Errors on a single
 * message are logged via `onError` and the message is dropped — they should
 * not abort the whole trace.
 */
export async function scoreBatch(
  inputs: Array<{ messageIndex: number; text: string }>,
  options?: { onError?: (err: unknown, messageIndex: number) => void },
): Promise<SentimentEntry[]> {
  const out: SentimentEntry[] = [];
  for (const { messageIndex, text } of inputs) {
    try {
      const scored = await scoreText(text);
      if (scored) {
        out.push({ messageIndex, label: scored.label, score: scored.score });
      }
    } catch (err) {
      options?.onError?.(err, messageIndex);
    }
  }
  return out;
}

function normalizeLabel(raw: unknown): SentimentLabel {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value.startsWith('pos')) return 'Positive';
  if (value.startsWith('neg')) return 'Negative';
  return 'Neutral';
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm -F @nakirosai/nakiros exec tsc --noEmit
git add apps/nakiros/src/services/sentiment/index.ts
git commit -m "feat(sentiment): add scoreText/scoreBatch façade with label normalization"
```

### Task 3.6: Sentiment store (read/write)

**Files:**
- Create: `apps/nakiros/src/services/sentiment/sentiment-store.ts`

- [ ] **Step 1: Write the store**

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { SentimentTrace } from '@nakiros/shared';

import { getSentimentTracePath } from './paths.js';

/**
 * Read a persisted sentiment trace for a given session. Returns `null` if no
 * trace exists or if the on-disk file is malformed.
 */
export function loadSentimentTrace(
  projectPath: string,
  sessionId: string,
): SentimentTrace | null {
  const path = getSentimentTracePath(projectPath, sessionId);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as SentimentTrace;
    if (!parsed.sessionId || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Atomic write — `<sid>.json.tmp` then rename. Prevents partial reads. */
export function persistSentimentTrace(trace: SentimentTrace): void {
  const path = getSentimentTracePath(trace.projectPath, trace.sessionId);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(trace, null, 2));
  // `renameSync` is atomic on the same filesystem.
  const { renameSync } = require('node:fs') as typeof import('node:fs');
  renameSync(tmp, path);
}
```

Note: the `require('node:fs')` is to keep the rename import local — if the repo style prefers a top-level import, hoist `renameSync` into the import block.

- [ ] **Step 2: Typecheck and commit**

```bash
pnpm -F @nakirosai/nakiros exec tsc --noEmit
git add apps/nakiros/src/services/sentiment/sentiment-store.ts
git commit -m "feat(sentiment): add atomic load/persist sentiment trace store"
```

---

## Phase 4 — Ingest integration

### Task 4.1: Wire sentiment scoring into the ingest runner

**Files:**
- Modify: `apps/nakiros/src/services/conversation-ingest/runner.ts`

Read the full file first; find where `ingestSession` writes the session body. Insert the sentiment scoring step **after** persistence so a sentiment failure never blocks ingest.

- [ ] **Step 1: Read the runner**

```bash
wc -l apps/nakiros/src/services/conversation-ingest/runner.ts
```

Locate the function that finishes a session ingest (likely `ingestSession` or whatever calls `upsertSession`). Identify the spot **after** `upsertSession` returns success and **before** the function returns.

- [ ] **Step 2: Add the sentiment call**

At the top of the file, add the import:

```ts
import { scoreBatch } from '../sentiment/index.js';
import { loadSentimentTrace, persistSentimentTrace } from '../sentiment/sentiment-store.js';
import { SENTIMENT_MODEL_ID } from '../sentiment/pipeline.js';
```

After `upsertSession` succeeds, add (only for `kind === 'user'` sessions — synthetic ones don't carry user affect we care about):

```ts
if (session.kind === 'user') {
  const existing = loadSentimentTrace(session.projectPath, session.sessionId);
  if (!existing || existing.transcriptMtime !== session.transcriptMtime) {
    try {
      const userInputs: Array<{ messageIndex: number; text: string }> = [];
      let userIdx = 0;
      for (const msg of messages) {
        if (msg.type !== 'user') continue;
        userIdx += 1;
        const text = msg.content?.trim() ?? '';
        if (text) userInputs.push({ messageIndex: userIdx, text });
      }
      const entries = await scoreBatch(userInputs, {
        onError: (err, idx) =>
          console.warn(`[sentiment] msg ${idx} failed:`, (err as Error).message),
      });
      persistSentimentTrace({
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        transcriptMtime: session.transcriptMtime,
        generatedAt: new Date().toISOString(),
        model: SENTIMENT_MODEL_ID,
        entries,
        observed: userInputs.length,
        skipped: userInputs.length - entries.length,
      });
    } catch (err) {
      // Sentiment is best-effort. Log and continue — never fail an ingest because of it.
      console.warn(`[sentiment] session ${session.sessionId} failed:`, (err as Error).message);
    }
  }
}
```

Adjust variable names if the surrounding code uses different identifiers (`messages`, `session` etc.). The key principle: **iterate user messages with a 1-indexed counter** to match the digest's turn numbering convention.

- [ ] **Step 3: Typecheck**

```bash
pnpm -F nakiros exec tsc --noEmit
```
Expected: 0 errors. If `messages` is not in scope at that point in `ingestSession`, re-fetch via `getConversationMessages(transcriptPath)` before the loop.

- [ ] **Step 4: Run the daemon manually and re-ingest one session**

```bash
pnpm -F @nakirosai/nakiros dev
```
In another terminal trigger a re-ingest of a known session (via the existing IPC or by deleting the `<sid>.json` body and letting the watcher pick it up). Confirm a new file appears at `~/.nakiros/ingest/projects/<encoded>/sentiment/<sid>.json` and `cat` it to verify the shape matches `SentimentTrace`.

- [ ] **Step 5: Commit**

```bash
git add apps/nakiros/src/services/conversation-ingest/runner.ts
git commit -m "feat(sentiment): score user messages during ingest, persist trace per session"
```

### Task 4.2: IPC handler — `sentiment:getTrace`

**Files:**
- Create: `apps/nakiros/src/daemon/handlers/sentiment.ts`
- Modify: `apps/nakiros/src/daemon/server.ts`
- Modify: `packages/shared/src/ipc-channels.ts` (file name may vary — grep for `IPC_CHANNELS`)
- Modify: `apps/frontend/src/global.d.ts`
- Modify: `apps/frontend/src/lib/nakiros-client.ts`

- [ ] **Step 1: Add the channel**

```bash
grep -rn "IPC_CHANNELS" packages/shared/src 2>/dev/null | head -5
```
Open the file that defines `IPC_CHANNELS`. Add:

```ts
'sentiment:getTrace': 'sentiment:getTrace',
```

- [ ] **Step 2: Write the handler**

Create `apps/nakiros/src/daemon/handlers/sentiment.ts`:

```ts
import type { SentimentTrace } from '@nakiros/shared';

import { loadSentimentTrace } from '../../services/sentiment/sentiment-store.js';

export interface GetSentimentTraceRequest {
  projectPath: string;
  sessionId: string;
}

export type GetSentimentTraceResult =
  | { ok: true; trace: SentimentTrace | null }
  | { ok: false; error: string };

export async function getSentimentTrace(
  req: GetSentimentTraceRequest,
): Promise<GetSentimentTraceResult> {
  if (!req?.projectPath || !req?.sessionId) {
    return { ok: false, error: 'missing-args' };
  }
  try {
    const trace = loadSentimentTrace(req.projectPath, req.sessionId);
    return { ok: true, trace };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 3: Register the handler**

In `apps/nakiros/src/daemon/server.ts`, locate where other handlers are bound (search for an existing `project:` or `classify-convo:` handler registration). Add:

```ts
import { getSentimentTrace } from './handlers/sentiment.js';
// ...
registerHandler(IPC_CHANNELS['sentiment:getTrace'], getSentimentTrace);
```

Match the exact registration pattern used by sibling handlers.

- [ ] **Step 4: Expose on the frontend client**

In `apps/frontend/src/lib/nakiros-client.ts`, add:

```ts
async getSentimentTrace(
  projectPath: string,
  sessionId: string,
): Promise<GetSentimentTraceResult> {
  return this.invoke('sentiment:getTrace', { projectPath, sessionId });
}
```

Match the existing client method shape (some methods may use a different invoke pattern). Update `apps/frontend/src/global.d.ts` similarly.

- [ ] **Step 5: Typecheck both sides**

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/nakiros/src/daemon/handlers/sentiment.ts apps/nakiros/src/daemon/server.ts packages/shared/src apps/frontend/src/lib/nakiros-client.ts apps/frontend/src/global.d.ts
git commit -m "feat(sentiment): IPC handler sentiment:getTrace + frontend client"
```

---

## Phase 5 — Gate 2: Ingest validation (USER CHECKPOINT)

### Task 5.1: Validate ingest integration

**Files:** none — manual review

- [ ] **Step 1: Restart daemon**

```bash
pkill -f "tsx bin/nakiros.ts" 2>/dev/null
pnpm -F @nakirosai/nakiros dev
```

- [ ] **Step 2: Re-ingest a project**

Via UI or IPC, trigger a re-ingest. Verify in `~/.nakiros/ingest/projects/<encoded>/sentiment/` that one `<sid>.json` appears per user session.

- [ ] **Step 3: Verify idempotence**

Re-ingest the same project. Confirm no duplicate writes (mtime on existing files unchanged unless the `.jsonl` source changed — that's the `transcriptMtime` guard).

- [ ] **Step 4: Measure overhead**

Compare `time` for a re-ingest of one project before and after the sentiment hook. Expected: < 10% added latency for a typical conv (~30 user messages × 50ms ≈ 1.5s extra). If higher, decide whether to move sentiment to a background queue (out of plan scope — would need a Task 5.x added at user discretion).

- [ ] **Step 5: User decision**

Hand off: "Ingest integration validated. Proceed to Phase 6 (sismograph track)?"

---

## Phase 6 — Frontend sismograph track

### Task 6.1: Discover the sismograph component

**Files:** discovery only

- [ ] **Step 1: Locate the sismograph**

```bash
grep -rn "sismograph\|Sismograph" apps/frontend/src 2>/dev/null | head -20
```

The shipped sismograph variant A (per memory `project_nakiros_sismograph_design_2026_04_30`) lives somewhere under `apps/frontend/src` — likely a component under `views/` or `components/conversations/`. Identify the file rendering the cost-stacked track.

- [ ] **Step 2: Read it**

Open and read the full file. Note where tracks are defined (typically an array of track configs, each with a color, a label, and a `data` array).

### Task 6.2: Add sentiment data fetching

**Files:**
- Modify: the sismograph component identified in Task 6.1 (or a parent that loads its data)

- [ ] **Step 1: Fetch the trace alongside existing data**

In whatever hook or `useEffect` already loads conversation data for the sismograph, add a parallel fetch:

```ts
const sentimentTrace = await nakirosClient.getSentimentTrace(projectPath, sessionId);
```

- [ ] **Step 2: Map entries to track points**

Build a points array with one point per scored user message:

```ts
const sentimentPoints =
  sentimentTrace?.trace?.entries.map((e) => ({
    x: e.messageIndex,
    y: scoreToAmplitude(e.label, e.score),
    color: labelToColor(e.label),
  })) ?? [];

function scoreToAmplitude(label: SentimentLabel, score: number): number {
  if (label === 'Negative') return -score;
  if (label === 'Positive') return score;
  return 0;
}

function labelToColor(label: SentimentLabel): string {
  if (label === 'Negative') return 'var(--n-danger, #e0405a)';
  if (label === 'Positive') return 'var(--n-success, #4caf78)';
  return 'var(--n-faint, #999)';
}
```

Use the existing new-design CSS variables — verify their names in `apps/frontend/src/index.css` or `theme.css`. If `--n-danger`/`--n-success` don't exist, use literal hex consistent with the rest of the new-design.

- [ ] **Step 3: Add a new track to the sismograph**

Where other tracks are defined (look for the cost-stacked track configuration), append a sentiment track that uses `sentimentPoints` and renders with the chosen color mapping. Keep visual weight low — sentiment is a secondary signal, not a primary one. A thin dot row above or below the cost track works; a full overlay does not.

- [ ] **Step 4: Build the frontend**

```bash
pnpm -F @nakiros/frontend build
```
Expected: clean build.

- [ ] **Step 5: Visual check**

Restart the daemon, open a conversation in the UI, confirm the sentiment track renders with the expected markers on user messages. Negative pikes should align with frustration moments you can find in the JSONL by eye.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(sentiment): render sentiment track in sismograph"
```

---

## Phase 7 — Final validation

### Task 7.1: Full validation suite

**Files:** none

- [ ] **Step 1: Typecheck everything**

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/landing exec tsc --noEmit
```
Expected: 0 errors across all three.

- [ ] **Step 2: Build**

```bash
turbo build
```
Expected: clean build.

- [ ] **Step 3: Frontend bundle**

```bash
pnpm -F @nakiros/frontend build
```
Expected: bundle ready under `apps/frontend/dist/`. Required because the `nakiros` binary serves the bundle from `dist/ui` (per memory `feedback_build_frontend_end_of_session`).

- [ ] **Step 4: Smoke run**

```bash
pnpm -F @nakirosai/nakiros dev
```
Open the served UI, navigate to a project with at least one ingested user session, confirm the sismograph shows the sentiment track and the conversation drawer reflects the same data.

- [ ] **Step 5: Save a memory note**

After everything is green, write a memory file capturing the shipped state and the model lazy-load decision, mirroring the convention used by `project_nakiros_sismograph_design_2026_04_30.md`. Path:

```
/Users/thomasailleaume/.claude/projects/-Users-thomasailleaume-Perso-timetrackerAgent/memory/project_nakiros_sentiment_prepass_shipped_<YYYY-MM-DD>.md
```

Add a line to `MEMORY.md` pointing at it. Mark the existing `project_nakiros_sentiment_prepass_2026_05_05.md` as superseded.

- [ ] **Step 6: Open a PR**

```bash
git push -u origin feat/sentiment-prepass
gh pr create --title "feat(sentiment): local sentiment pre-pass on conversation ingest" --body "$(cat <<'EOF'
## Summary
- Adds an isolated local sentiment-scoring brick (`@xenova/transformers` + `Xenova/distilbert-base-multilingual-cased-sentiments-student`) that runs after session ingest.
- Persists `SentimentTrace` per session under `~/.nakiros/ingest/projects/<encoded>/sentiment/<sid>.json`.
- Exposes the trace via `sentiment:getTrace` IPC and renders a new sentiment track in the sismograph.
- V1.1 friction classifier untouched (rebrand reserved for V1.2).

## Test plan
- [ ] POC validation gates passed (cold start < 5s, inference < 100ms/msg, RSS < 500MB, qualité labels ≥ 80%).
- [ ] Ingest integration: `<sid>.json` written for user sessions only; idempotent via `transcriptMtime`.
- [ ] IPC roundtrip: `sentiment:getTrace` returns the trace; frontend renders the track.
- [ ] `tsc --noEmit` clean on nakiros / frontend / landing.
- [ ] `turbo build` succeeds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** Each of the spec's 3 gates is materialized as a manual checkpoint (Phase 2, Phase 5, Phase 7). Each gate's measurement is reproduced from the spec.
- **No vitest:** explicitly deviated from the writing-plans skill's default TDD because the project has no JS test framework today. Behavioral verification = POC + tsc + manual smoke. Documented in the "Design deviations" section above.
- **Async safety:** every sentiment failure is caught and logged — ingest never aborts because of sentiment.
- **Idempotence:** `transcriptMtime` guard avoids re-scoring unchanged conversations.
- **Cleanup:** orphan digests called out but explicitly out of scope.
- **Type consistency:** `SentimentLabel` / `SentimentEntry` / `SentimentTrace` are defined once in `packages/shared/src/types/sentiment.ts` and referenced from every consumer.
