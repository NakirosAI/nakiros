# claude-config-reader.ts

**Path:** `apps/nakiros/src/services/claude-config-reader.ts`

Read-only scanner that builds a `ClaudeConfigSnapshot` from a project's `.claude/` directory.
Used by `claudeConfig:scan`, `claudeRules:list`, `claudeAgents:list`, `claudeMcp:list`, and
`claudeOutputStyles:list`. Pure read — never mutates. Also provides `readClaudeConfigFile` for
raw file access with path-traversal protection.

## Exports

### `scanClaudeConfig`

```ts
export function scanClaudeConfig(projectPath: string): ClaudeConfigSnapshot
```

Build a complete read-only snapshot covering CLAUDE.md, settings (project + local), rules,
skills count, commands, output styles, subagents, MCP, and hooks. Called on every Configuration
tab open and on `claudeRules:list` / `claudeAgents:list` / `claudeMcp:list` to reuse the scan.

### `readClaudeConfigFile`

```ts
export function readClaudeConfigFile(projectPath: string, relativePath: string): string | null
```

Read any file inside `.claude/` (or `.mcp.json` at the project root) by relative path. Returns
`null` on missing file or path-traversal attempt. Called by `claudeConfig:readFile`.
