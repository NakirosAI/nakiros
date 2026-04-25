# agent-run.ts

**Path:** `packages/shared/src/types/agent-run.ts`

Unified primitive surfaced to the runs center, the activity feed, and any "is something running on this target?" check across the UI. Each runner emits its native record; an adapter on the frontend translates it into this shape.

## Exports

### `type AgentRunKind`

```ts
export type AgentRunKind = 'audit' | 'eval' | 'fix' | 'create'
```

The discriminator. Each kind has its own backing runner on the daemon and its own native landing screen on the frontend. New kinds (e.g. `analyze-convo`) extend this union without changing the surrounding contract.

### `type AgentRunStatus`

```ts
export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'done'
  | 'failed'
  | 'cancelled'
```

Lifecycle status surfaced to the UI. Mapped from each runner's native status by the corresponding adapter — keeping a single set of strings means the topbar / runs center / status badges share one rendering pipeline.

### `interface AgentRunCapabilities`

```ts
export interface AgentRunCapabilities {
  canSendMessage: boolean;
  canApprove: boolean;
  canStop: boolean;
}
```

Capabilities the UI must expose for this run. All three default to `true` — a runner declares `false` only when the operation is genuinely impossible (e.g. a passive read-only audit that cannot accept user messages mid-run).

### `interface SkillRunTarget`

```ts
export interface SkillRunTarget {
  type: 'skill';
  scope: SkillScope;
  skillName: string;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
}
```

Skill-bound target — common shape for audit / eval / fix / create. Carries enough identity to resolve the underlying skill directory and to deep-link the user back to the right native screen.

### `type AgentRunTarget`

```ts
export type AgentRunTarget = SkillRunTarget
```

Discriminated union of every supported target shape. New target kinds (e.g. `{ type: 'conversation'; conversationId: string; … }`) extend this union when their corresponding agent-run kind ships.

### `interface AgentRun`

```ts
export interface AgentRun {
  id: string;
  kind: AgentRunKind;
  title: string;
  target: AgentRunTarget;
  status: AgentRunStatus;
  startedAt: string;
  endedAt?: string;
  capabilities: AgentRunCapabilities;
  tokensUsed?: number;
}
```

`events` is intentionally omitted from this v1 type — the activity-feed channel will carry events when it lands; v1 only consumes the metadata.
