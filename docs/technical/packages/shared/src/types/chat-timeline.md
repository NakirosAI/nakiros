# chat-timeline.ts

**Path:** `packages/shared/src/types/chat-timeline.ts`

Defines the common base union for the conversation timeline of any run kind (audit / eval / fix / create), derived from Claude Code's session JSONL. Each entry carries the original ISO `ts` so the frontend renders at the correct chronological position without synthetic stamping. Run-specific kinds (e.g. fix's `edit` / `finding` / `eval_result`) are defined alongside their run types and union with this base.

## Exports

### `ChatTimelineEntry`

Common discriminated union for every run kind's conversation timeline. The fix runner extends this base with its own `edit`, `finding`, and `eval_result` kinds.

```ts
export type ChatTimelineEntry =
  | { kind: 'user'; ts: string; text: string }
  | { kind: 'assistant_text'; ts: string; text: string }
  | { kind: 'tool'; ts: string; name: string; display: string };
```

**Variants:**
- `user` — User message: initial prompt or reply.
- `assistant_text` — Assistant free-form text reply.
- `tool` — Assistant generic `tool_use` (Bash, Read, Glob, Grep, …). Run-specific renderers may intercept some tools before they reach this kind.

### `AuditTimelineEntry`

Audit run conversation timeline. Aliased to `ChatTimelineEntry` because audit doesn't emit run-specific kinds — the audit-progress sidebar (manifest, sections, findings) lives on a separate event stream.

```ts
export type AuditTimelineEntry = ChatTimelineEntry;
```

### `BootstrapTimelineEntry`

Bootstrap run conversation timeline. Same rationale as `AuditTimelineEntry` — the plan itself streams via the separate `plan_updated` event (`BootstrapRunEvent`), so the chat view only needs the three universal kinds.

```ts
export type BootstrapTimelineEntry = ChatTimelineEntry;
```
