# subagents.ts

**Path:** `apps/nakiros/src/daemon/handlers/subagents.ts`

Registers `subagents:*` channels for the `nakiros-subagents-expert` audit/fix flow. Supports
recursive discovery of `.md` files under `.claude/agents/` (sub-folders OK). All `subagentName`
values are relative filenames from `.claude/agents/`. Path-traversal is rejected at the handler
boundary. Save uses optimistic-lock (mtime). Audit history served from
`~/.nakiros/<projectId>/subagents-audits/<encoded-subagentName>/`.

**Note:** These channels are distinct from `claudeAgents:*` (Module 2 V2 form editor). The path-resolution and write logic behind `subagents:save` now live in [`subagents-writer.ts`](../../services/subagents-writer.md) (`resolveSubagentPath`, `writeSubagentFile`) — extracted so the bootstrap dispatch (`bootstrap-dispatch.ts`) can reuse the exact same write path instead of forking a variant.

## IPC channels

- `subagents:list` — returns `SubagentsListResult` with metadata (description, model, tools) for every subagent
- `subagents:read` — returns `SubagentsReadResult` (content + mtime + exists) for one subagent
- `subagents:save` — write a subagent with mtime conflict detection; returns `SubagentsMutationResult`
- `subagents:delete` — delete a subagent file; returns `SubagentsMutationResult`
- `subagents:listAudits` — returns `SubagentsAuditHistoryEntry[]` for a subagent, newest-first
- `subagents:readAudit` — read a single archived audit report by absolute path

## Exports

### `subagentsHandlers`

```ts
export const subagentsHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
