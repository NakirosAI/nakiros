# project-bootstrap.ts

**Path:** `packages/shared/src/types/project-bootstrap.ts`

Shared types for the project `.claude` Bootstrap feature. Defines the global configuration plan produced by the bootstrap analyse step (`ProjectBootstrapPlan`, `BootstrapEntityProposal`), and the interactive runner's status/run/event/request shapes (`BootstrapRun`, `BootstrapRunEvent`, `StartBootstrapRequest`, `ApproveBootstrapPlanRequest`) — the plan → discuss → approve → execute lifecycle described in `docs/redesign/features/project-bootstrap.md`.

## Exports

### `BootstrapProposalStatus`

Lifecycle of a single entity proposal inside a `ProjectBootstrapPlan`. `pending` is the default right after the analyse step and means "implicitly included in execution" **literally**: `approveBootstrapPlan` promotes every proposal still `pending` at approval time (any proposal absent from `ApproveBootstrapPlanRequest.decisions`) to `accepted` before dispatch, matching the validation UI's default-checked checkbox semantics. The user can still flip a proposal to `accepted` (explicitly) or `rejected`; only `rejected` proposals are skipped by dispatch. `written` / `failed` are set once the execute step has run — doubles as both "user decision" and "execution outcome".

```ts
export type BootstrapProposalStatus = 'pending' | 'accepted' | 'rejected' | 'written' | 'failed';
```

### `BootstrapEntityProposal`

One atomic proposal covering a single `.claude/` entity — mirrors `RecoCard` (see [recommendation.ts](./recommendation.md)) but produced up-front by the bootstrap analyse step instead of per friction pattern. Reuses `RecommendationArtifactType` for the entity taxonomy instead of redefining it.

```ts
export interface BootstrapEntityProposal {
  id: string;
  artifactType: RecommendationArtifactType;
  target: string;
  title: string;
  rationale: string;
  content: string;
  status: BootstrapProposalStatus;
  editedAt?: string;
  writtenPath?: string;
  error?: string;
}
```

### `ProjectBootstrapPlan`

Global configuration plan produced by the bootstrap analyse step — one coherent proposal covering every `.claude/` entity so cross-entity coherence is decided in a single pass instead of entity by entity. Persisted as part of the `BootstrapRun` so it survives daemon restarts and reopening the screen.

```ts
export interface ProjectBootstrapPlan {
  projectId: string;
  projectPath: string;
  generatedAt: string;
  summary: string;
  usedFrictionDigests: boolean;
  proposals: BootstrapEntityProposal[];
}
```

### `BootstrapRunStatus`

Lifecycle status of a `BootstrapRun`. Extends the familiar `AuditRunStatus` shape (`starting`/`running`/`waiting_for_input`/terminal) with two bootstrap-specific phases: `awaiting_approval` (the plan is ready and the user is checking/unchecking/editing entities — no agent turn active) and `executing` (writes applied through the per-entity writers, after approval).

```ts
export type BootstrapRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'stopped';
```

### `BootstrapRun`

Full in-memory state of a project bootstrap run — modeled on `AuditRun` (single skill-bound conversational agent) but targeting the whole project and carrying the evolving `ProjectBootstrapPlan` instead of an audit report. `turns` covers both the analyse step and the discuss step — one conversation, replayed as a single timeline.

```ts
export interface BootstrapRun {
  runId: string;
  projectId: string;
  projectPath: string;
  status: BootstrapRunStatus;
  sessionId: string | null;
  workdir: string;
  cwd?: string;
  plan: ProjectBootstrapPlan | null;
  /** Populated on list payloads (`bootstrap:listAll`/`bootstrap:listActive`) where `plan`/`turns` are stripped to keep the dock poll light. */
  proposalCount?: number;
  turns: AuditRunTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  interruptedByReboot?: boolean;
}
```

### `StartBootstrapRequest`

Request payload for `bootstrap:start`.

```ts
export interface StartBootstrapRequest {
  projectId: string;
  projectPath: string;
}
```

### `ApproveBootstrapPlanRequest`

Request payload for `bootstrap:approvePlan` — the user's final per-entity decisions before execution begins. Proposals **not** listed are NOT left unchanged: any proposal still `pending` is promoted to `accepted` before dispatch (see `BootstrapProposalStatus`) — only an explicit `rejected` decision excludes a proposal from execution. Proposals already `accepted`/`rejected` and not listed here keep that status.

```ts
export interface ApproveBootstrapPlanRequest {
  runId: string;
  decisions: Array<{
    id: string;
    status: 'accepted' | 'rejected';
    content?: string;
  }>;
}
```

### `BootstrapRunEvent`

Event broadcast on `bootstrap:event` while a bootstrap run is alive.

```ts
export interface BootstrapRunEvent {
  runId: string;
  event:
    | { type: 'status'; status: BootstrapRunStatus }
    | { type: 'text'; text: string; ts?: string }
    | { type: 'tool'; name: string; display: string; ts?: string }
    | { type: 'tokens'; tokensUsed: number }
    | { type: 'waiting_for_input'; lastAssistantText: string }
    | { type: 'plan_updated'; plan: ProjectBootstrapPlan }
    | { type: 'done'; exitCode: number; error?: string }
    | { type: 'error'; error: string };
}
```
