# rules.ts

**Path:** `apps/nakiros/src/daemon/handlers/rules.ts`

Registers `rules:*` channels for the `nakiros-rules-expert` audit/fix flow. Supports recursive
discovery of `.md` files under `.claude/rules/` (sub-folders OK). All `ruleName` values are
relative paths from `.claude/rules/`. Path-traversal is rejected at the handler boundary.
Save uses optimistic-lock (mtime). Audit history served from
`~/.nakiros/<projectId>/rules-audits/<encoded-ruleName>/`.

**Note:** These channels are distinct from `claudeRules:*` (Module 1 V2 form editor). The path-resolution and write logic behind `rules:save` now live in [`rules-writer.ts`](../../services/rules-writer.md) (`resolveRulePath`, `writeRuleFile`) — extracted so the bootstrap dispatch (`bootstrap-dispatch.ts`) can reuse the exact same write path instead of forking a variant.

## IPC channels

- `rules:list` — returns `RulesListResult` with metadata for every rule (recursive walk)
- `rules:read` — returns `RulesReadResult` (content + mtime + exists) for one rule
- `rules:save` — write a rule with mtime conflict detection; returns `RulesMutationResult`
- `rules:delete` — delete a rule file; returns `RulesMutationResult`
- `rules:listAudits` — returns `RulesAuditHistoryEntry[]` for a rule, newest-first
- `rules:readAudit` — read a single archived audit report by absolute path

## Exports

### `rulesHandlers`

```ts
export const rulesHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
