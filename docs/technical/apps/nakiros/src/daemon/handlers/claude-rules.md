# claude-rules.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-rules.ts`

Registers `claudeRules:*` channels for the Module 1 V2 rules editor. The list reuses
`scanClaudeConfig` (rules slice only) to avoid a full-snapshot round-trip. Read/save carry
an mtime token to detect external modifications. A `suggestPaths` channel provides
path-glob suggestions based on the project's actual file tree.

## IPC channels

- `claudeRules:list` — returns `RuleEntry[]` for all rules in the project
- `claudeRules:read` — returns `RuleFileContent` (raw content + mtime + parsed paths)
- `claudeRules:create` — create a new rule file; returns `RuleMutationResult`
- `claudeRules:save` — overwrite a rule with mtime conflict detection; returns `RuleMutationResult`
- `claudeRules:delete` — delete a rule file; returns `RuleMutationResult`
- `claudeRules:suggestPaths` — return up to 7 path-glob suggestions for the new-rule dialog

## Exports

### `claudeRulesHandlers`

```ts
export const claudeRulesHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
