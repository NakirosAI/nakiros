# dot-claude-snapshot

**Path:** `packages/shared/src/types/dot-claude-snapshot.ts`

Read-only snapshot of a project's entire `.claude/` ecosystem. Produced by `buildDotClaudeSnapshot` and consumed by `.claude/` expert agents (claudemd-expert, rules-expert, …) as cross-entity context. All arrays are always present — consumers iterate without null-guards.

## Exports

### `interface DotClaudeSnapshot`

Root snapshot shape. Consumed by expert agents to detect cross-entity coherence issues.

```ts
export interface DotClaudeSnapshot {
  projectId: string
  projectPath: string
  generatedAt: string
  claudemd: DotClaudeSnapshotClaudeMd
  rules: DotClaudeSnapshotRule[]
  subagents: DotClaudeSnapshotSubagent[]
  hooks: DotClaudeSnapshotHook[]
  permissions: DotClaudeSnapshotPermissions
  mcpServers: DotClaudeSnapshotMcpServer[]
  outputStyles: DotClaudeSnapshotOutputStyle[]
  skills: DotClaudeSnapshotSkill[]
}
```

### `interface DotClaudeSnapshotClaudeMd`

CLAUDE.md metadata and full content. `exists: false` when the file is absent; `content` is then `""`.

```ts
export interface DotClaudeSnapshotClaudeMd {
  exists: boolean
  path: string
  totalLines: number
  sections: string[]   // ## headings in document order
  imports: string[]    // @<path> imports, fenced-block-safe
  content: string
}
```

### `interface DotClaudeSnapshotRule`

One rule file under `.claude/rules/`.

```ts
export interface DotClaudeSnapshotRule {
  name: string         // filename without .md
  path: string
  pathsGlob: string[]  // frontmatter paths:
  description: string
  content: string
}
```

### `interface DotClaudeSnapshotSubagent`

One agent file under `.claude/agents/`.

```ts
export interface DotClaudeSnapshotSubagent {
  name: string
  path: string
  model: string | null
  description: string
  tools: string[]
}
```

### `interface DotClaudeSnapshotHook`

One flattened hook entry from project or user `settings.json`.

```ts
export interface DotClaudeSnapshotHook {
  event: string
  matcher: string | null
  command: string
  scope: 'project' | 'user'
}
```

### `interface DotClaudeSnapshotPermissions`

Merged permission lists from project and user settings.

```ts
export interface DotClaudeSnapshotPermissions {
  allow: string[]
  deny: string[]
  scope: 'project' | 'user' | 'mixed' | 'none'
}
```

### `interface DotClaudeSnapshotMcpServer`

One MCP server entry from `.mcp.json` or `settings.json`.

```ts
export interface DotClaudeSnapshotMcpServer {
  name: string
  type: 'stdio' | 'sse' | 'http'
  command: string | null
  url: string | null
}
```

### `interface DotClaudeSnapshotOutputStyle`

One output style file from project or user output-styles directory.

```ts
export interface DotClaudeSnapshotOutputStyle {
  name: string
  path: string
  scope: 'project' | 'user'
}
```

### `interface DotClaudeSnapshotSkill`

Identity-only skill entry (name + description + scope + path). SKILL.md content is deliberately excluded to keep the snapshot lean.

```ts
export interface DotClaudeSnapshotSkill {
  name: string
  description: string
  scope: 'project' | 'user' | 'nakiros-bundled'
  path: string
}
```
