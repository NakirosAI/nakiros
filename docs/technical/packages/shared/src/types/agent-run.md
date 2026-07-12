# agent-run.ts

**Path:** `packages/shared/src/types/agent-run.ts`

Unified primitive surfaced to the runs center, the activity feed, and any "is something running on this target?" check across the UI. Each runner emits its native record; an adapter on the frontend (`hooks/useAgentRunsSync.ts`) translates it into this shape.

## Exports

### `type AgentRunKind`

```ts
export type AgentRunKind = 'audit' | 'eval' | 'fix' | 'create' | 'edit' | 'analyze-convo' | 'classify-convo' | 'recommendation-analyze' | 'bootstrap'
```

The discriminator. Each kind has its own backing runner on the daemon and its own native landing screen on the frontend. New kinds extend this union without changing the surrounding contract. `bootstrap` (Project `.claude` Bootstrap, see `docs/redesign/features/project-bootstrap.md`) is surfaced in the topbar `RunDock` like every other kind, but does NOT open through the generic `RunScreen` — its `BootstrapRunTarget` and `AgentRun` mapping exist purely so `RunDock`/`agentRunStore` can list/stop it; `views/BootstrapScreen.tsx` owns its actual lifecycle UI standalone.

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

Skill-bound target — common shape for audit / eval / fix / create. Carries enough identity to resolve the underlying skill directory and to deep-link the user back to the right native screen.

### `interface ConversationRunTarget`

Conversation-bound target — used by the `analyze-convo` / `classify-convo` kinds. Carries the project id + Claude Code session id so the runner can locate the JSONL and the frontend can deep-link back to the diagnostic view.

### `interface ClaudeMdRunTarget` / `RulesRunTarget` / `SubagentsRunTarget` / `HooksRunTarget` / `PermissionsRunTarget` / `McpRunTarget` / `OutputStylesRunTarget`

One target shape per bundled `.claude/` expert (`nakiros-claudemd-expert`, `-rules-expert`, `-subagents-expert`, `-hooks-expert`, `-permissions-expert`, `-mcp-expert`, `-output-styles-expert`), each carrying `projectId` + `projectPath` and the run's `mode`. `HooksRunTarget` / `McpRunTarget` are singleton per project (no name field); `RulesRunTarget` / `SubagentsRunTarget` / `OutputStylesRunTarget` additionally carry the relative filename; `PermissionsRunTarget` carries a `scope` (`'project' | 'local'`) instead.

### `interface BootstrapRunTarget`

```ts
export interface BootstrapRunTarget {
  type: 'bootstrap';
  projectId: string;
  projectPath: string;
}
```

Project-bootstrap-bound target — used by the `bootstrap` kind. Project-scoped like `ClaudeMdRunTarget`, but singleton per project and carries no `mode` — bootstrap isn't reused across audit/fix/create/edit flavors, it's its own self-contained plan → discuss → approve → execute run.

### `type AgentRunTarget`

```ts
export type AgentRunTarget = SkillRunTarget | ConversationRunTarget | ClaudeMdRunTarget | RulesRunTarget | SubagentsRunTarget | HooksRunTarget | PermissionsRunTarget | McpRunTarget | OutputStylesRunTarget | BootstrapRunTarget
```

Discriminated union of every supported target shape. New target kinds extend this union when their corresponding agent-run kind ships.

### `type AgentRunMeta`

Kind-specific opaque payload riding alongside an `AgentRun`. The store never inspects it; only the matching `kind`'s adapter and its consumer (the focus handler in `useSkillsViewState`) read the relevant variant.

- `eval` carries the batch of run ids that share the same skill+iteration, so clicking the entry can open `EvalRunsView` with the full batch, plus an optional `createRunId` when the batch was launched from a create run.

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
  meta?: AgentRunMeta;
}
```

`events` is intentionally omitted from this type — the activity-feed channel will carry events when it lands; today only the metadata is consumed.
