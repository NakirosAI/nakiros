# recommendation-inventory.ts

**Path:** `apps/nakiros/src/services/recommendation-inventory.ts`

Builds a `ProjectInventory` digest of all existing `.claude/` artefacts for a
project. The inventory is fed as `inventory.json` into the recommendation
analyser's workdir so the LLM can target real artefacts for `action=fix`
rather than inventing names.

Delegates entirely to `buildDotClaudeSnapshot` — no listing logic is
reimplemented here. All eight artefact types are mapped:

| Snapshot field     | InventoryItem type | Scope filter       |
|--------------------|--------------------|--------------------|
| `claudemd`         | `'claudemd'`       | exists only        |
| `rules[]`          | `'rules'`          | all                |
| `subagents[]`      | `'subagent'`       | all                |
| `skills[]`         | `'skill'`          | `'project'` only   |
| `outputStyles[]`   | `'output-style'`   | `'project'` only   |
| `mcpServers[]`     | `'mcp'`            | all                |
| `hooks[]`          | `'hook'`           | `'project'` only   |
| `permissions`      | `'permission'`     | scope !== `'none'` |

## Exported types

### `InventoryItem`

```ts
interface InventoryItem {
  id: string;
  type: 'rules' | 'skill' | 'claudemd' | 'subagent' | 'hook' | 'permission' | 'mcp' | 'output-style';
  label: string;
  description?: string;
  hint?: string;
}
```

Stable identifier for the artefact (`name` for collections, `'CLAUDE.md'` /
`'permissions'` for singletons). `hint` carries extra context: glob patterns
for rules, transport command/url for MCP servers, permissions scope for the
singleton.

### `ProjectInventory`

```ts
interface ProjectInventory {
  projectId: string;
  projectPath: string;
  generatedAt: string;   // ISO 8601
  items: InventoryItem[];
}
```

### `buildProjectInventory`

```ts
async function buildProjectInventory(
  projectId: string,
  projectPath: string,
): Promise<ProjectInventory>
```

Resilient: if `buildDotClaudeSnapshot` throws (e.g. permission denied), a
warning is printed to stderr and an empty `items: []` inventory is returned —
the analyser still runs and produces create-only suggestions.
