# recommendation.ts

**Path:** `packages/shared/src/types/recommendation.ts`

Shared types for the friction-pattern recommendations feature. Defines the cluster shape (`RecommendationPattern`), individual recommendation card (`RecoCard`), the single-turn LLM analyser run (`RecommendationAnalyzeRun`), and IPC request/response payloads — the full contract consumed by the daemon clustering module, the analyser runner, the apply service, and the frontend.

## Exports

### `RecommendationZoneRef`

Reference to a single friction zone inside a conversation.

```ts
export interface RecommendationZoneRef {
  convoId: string;
  zoneId: string;
}
```

### `RecommendationPattern`

Per-project cluster of similar friction zones. Computed by `services/recommendation-cluster.ts` from cached `ConversationAnalysis` entries. No LLM involved at this stage — the LLM is invoked later by the analyser run referenced in `analysis`.

```ts
export interface RecommendationPattern {
  /** Stable hash of `zoneRefs` sorted lexicographically (`convoId:zoneId`). */
  id: string;
  projectId: string;
  zoneRefs: RecommendationZoneRef[];
  signature: {
    topTokens: string[];
    filesTouched: string[];
    signalKinds: Array<'S4' | 'S5' | 'S6'>;
    firstSeen: string;
    lastSeen: string;
  };
  zoneCount: number;
  severity: 'medium' | 'high';
  analysis: {
    status: 'idle' | 'running' | 'done' | 'failed';
    runId?: string;
    recoCount?: number;
    lastAnalyzedAt?: string;
  };
}
```

### `RecommendationArtifactType`

Type of `.claude/` artefact a recommendation targets.

```ts
export type RecommendationArtifactType =
  | 'rules'
  | 'skill'
  | 'claudemd'
  | 'subagent'
  | 'hook'
  | 'permission'
  | 'mcp'
  | 'output-style';
```

### `RecoCard`

One atomic recommendation card produced by an analyser run. Persisted as a markdown file with YAML frontmatter under `~/.nakiros/<projectId>/recommendations/<patternId>/recos/<recId>.md`.

```ts
export interface RecoCard {
  recId: string;
  patternId: string;
  action: 'fix' | 'create';
  artifactType: RecommendationArtifactType;
  target: string;
  title: string;
  body: string;
  brief: string;
  evidence: {
    zoneRefs: RecommendationZoneRef[];
    files: string[];
  };
  status: 'pending' | 'applied' | 'dismissed';
  appliedRunId?: string;
  createdAt: string;
  editedAt?: string;
}
```

### `StartRecommendationAnalyzeRequest`

Request payload for `recommendations:analyzePattern`.

```ts
export interface StartRecommendationAnalyzeRequest {
  projectId: string;
  patternId: string;
}
```

### `ApplyRecoResponse`

Response shape from `recommendations:applyReco`. On success the downstream runner has been spawned and `runId` identifies it.

```ts
export type ApplyRecoResponse =
  | { ok: true; runId: string; runKind: 'fix' | 'create' | 'edit' }
  | { ok: false; error: 'target-missing' | 'unknown-artifact-type' | 'reco-not-found' };
```

### `RecommendationAnalyzeRunStatus`

Lifecycle states of a `RecommendationAnalyzeRun`. Mirrors `ClassifyConvoRunStatus` — same set of values, separate type so future specialisation does not pollute the shared union.

```ts
export type RecommendationAnalyzeRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'stopped';
```

### `RecommendationAnalyzeRun`

Single-turn analyser run that sends a cluster digest to the LLM and persists the resulting `RecoCard`s. Mirrors `ClassifyConvoRun` — source pattern is tracked via `sourcePatternId` (stable) while `sessionId` is overwritten by runner-core on the first stream event. See `feedback_runner_core_session_id_overwrite.md`.

```ts
export interface RecommendationAnalyzeRun {
  runId: string;
  projectId: string;
  sourcePatternId: string;
  sessionId: string;
  status: RecommendationAnalyzeRunStatus;
  sessionClaudeId: string | null;
  workdir: string;
  model: 'sonnet' | 'opus';
  recoCount: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  interruptedByReboot?: boolean;
}
```

### `RecommendationAnalyzeRunEvent`

Event broadcast on `recommendations:event` while an analyser run is alive. Consumed by the frontend to drive live progress feedback.

```ts
export interface RecommendationAnalyzeRunEvent {
  runId: string;
  event:
    | { type: 'stream'; data: unknown }
    | { type: 'status'; status: RecommendationAnalyzeRunStatus }
    | { type: 'done'; recoCount: number }
    | { type: 'error'; error: string };
}
```
