# claude-config.ts

**Path:** `apps/nakiros/src/daemon/handlers/claude-config.ts`

Read-only handlers for the Configuration tab V1. Provides a full `.claude/` snapshot
(`claudeConfig:scan`) and raw file access (`claudeConfig:readFile`). Does not mutate;
per-entity writes go through the dedicated `claude-rules`, `claude-agents`, etc. handlers.

## IPC channels

- `claudeConfig:scan` — returns a `ClaudeConfigSnapshot` covering CLAUDE.md, settings, rules, skills count, commands, output styles, subagents, MCP, hooks
- `claudeConfig:readFile` — returns the raw content of any `.claude/`-relative file (or `.mcp.json` at the project root); returns `null` on missing file or path-traversal attempt

## Exports

### `claudeConfigHandlers`

```ts
export const claudeConfigHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
