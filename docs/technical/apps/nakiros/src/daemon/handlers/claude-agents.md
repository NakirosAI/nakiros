# claude-agents.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-agents.ts`

Registers the `claudeAgents:*` IPC channels for the Module 2 V2 subagent editor. Each channel
operates on `.claude/agents/` markdown files in the target project; the list reuses the
project-wide `scanClaudeConfig` snapshot. Edits are validated (YAML frontmatter must parse)
before atomic write.

## IPC channels

- `claudeAgents:list` — returns `AgentEntry[]` metadata for every subagent in the project
- `claudeAgents:read` — returns `AgentFileContent` (raw frontmatter + body + parsed essentials) for one agent
- `claudeAgents:create` — scaffold a new agent file; returns `AgentMutationResult`
- `claudeAgents:save` — overwrite frontmatter + body with mtime conflict detection; returns `AgentMutationResult`
- `claudeAgents:delete` — remove an agent file; returns `AgentMutationResult`

## Exports

### `claudeAgentsHandlers`

```ts
export const claudeAgentsHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
