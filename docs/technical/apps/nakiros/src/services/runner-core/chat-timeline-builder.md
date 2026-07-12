# chat-timeline-builder.ts

**Path:** `apps/nakiros/src/services/runner-core/chat-timeline-builder.ts`

Shared timeline builder extracted from `audit-runner.ts`'s `getAuditTimeline` and `bootstrap-runner.ts`'s near-identical `getBootstrapTimeline` (`.claude/rules/runners.md` — "identify the 80% common path... do not fork"). Builds the universal `user` / `assistant_text` / `tool` conversation timeline from a Claude Code session jsonl. Used by any run kind whose live-progress sidebar lives on a separate structured event stream instead of the chat itself; kinds with their own extra timeline entries (e.g. fix's `edit` / `finding` / `eval_result`) build on top of this instead of reusing it verbatim.

## Exports

### `ExcludedToolPathPredicate`

Predicate deciding whether a `Write` / `Edit` / `MultiEdit` tool_use targets one of the runner's own internal progress artefacts and should be hidden from the generic tool timeline.

```ts
export type ExcludedToolPathPredicate = (input: Record<string, unknown>, agentCwd: string) => boolean;
```

### `buildChatTimeline`

Build the universal `user` / `assistant_text` / `tool` conversation timeline from a Claude Code session jsonl. Entries are stable-sorted by `ts`.

```ts
export function buildChatTimeline(
  sessionBase: string,
  sessionId: string,
  isExcludedToolPath: ExcludedToolPathPredicate,
): ChatTimelineEntry[]
```

**Parameters:**
- `sessionBase` — directory Claude Code's session file is keyed by (`run.cwd ?? run.workdir`)
- `sessionId` — Claude Code session id
- `isExcludedToolPath` — hides a Write/Edit/MultiEdit tool_use whose `file_path` matches a runner-internal artefact
