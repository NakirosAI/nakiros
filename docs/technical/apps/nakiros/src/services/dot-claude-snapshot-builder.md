# dot-claude-snapshot-builder

**Path:** `apps/nakiros/src/services/dot-claude-snapshot-builder.ts`

Synchronous builder that produces a `DotClaudeSnapshot` — a read-only JSON picture of a project's entire `.claude/` configuration. Called inside `prepareWorkdir` for CLAUDE.md audit and fix runs, then serialised to `dot-claude-snapshot.json` in the agent's workdir so the expert agent can read it via its `Read` tool at the start of each session.

Reads from: CLAUDE.md, `.claude/rules/*.md`, `.claude/agents/*.md`, `.claude/settings.json` (project + user), `~/.claude/settings.json`, `.mcp.json`, `.claude/output-styles/`, `~/.claude/output-styles/`, `.claude/skills/`, `~/.claude/skills/`, and `~/.nakiros/skills/` (bundled skills).

Graceful against missing files and directories — every array defaults to empty, no exception is thrown.

## Exports

### `buildDotClaudeSnapshot`

```ts
export function buildDotClaudeSnapshot(input: {
  projectId: string;
  projectPath: string;
}): DotClaudeSnapshot
```

Build a read-only snapshot of a project's entire `.claude/` ecosystem.

Synchronous (all I/O via `readFileSync`). Intended to be called just before
spawning a `.claude/` expert agent so it can read the snapshot via its
`Read` tool.

**Parameters:**
- `input.projectId` — stable project identifier written into the snapshot for downstream consumers
- `input.projectPath` — absolute path to the project root; all relative reads are anchored here

**Returns:** a fully-populated `DotClaudeSnapshot` — all arrays are always present (empty when no items exist).
