# projects.ts

**Path:** `apps/nakiros/src/daemon/handlers/projects.ts`

Registers the `project:*` IPC channels — project scanning, conversation metadata, conversation analysis (deterministic + LLM-powered), and project-scoped skill CRUD.

## IPC channels

### Scanning + metadata
- `project:scan` — walk provider dirs for Claude Code projects (broadcasts progress)
- `project:list`, `project:get`, `project:dismiss`
- `project:getStats`, `project:getGlobalStats` — currently stubbed to `null`

### Conversations
- `project:listConversations`
- `project:getConversationMessages`
- `project:analyzeConversation` — deterministic analyzer (no LLM)
- `project:listConversationsWithAnalysis` — convenience: list + per-conv analysis
- `project:deepAnalyzeConversation` — LLM-powered deep analysis (Haiku / Sonnet-1M)
- `project:loadDeepAnalysis` — read the cached deep analysis

### Skills
- `project:listSkills`, `project:getSkill`, `project:saveSkill`
- `project:readSkillFile`, `project:saveSkillFile`
- `project:getRecommendations` — currently stubbed to `[]`

## Broadcasts

- `project:scanProgress` — fired via `eventBus.broadcast` while `project:scan` walks provider directories. The `provider` field now reflects the actual provider being scanned (`'claude'` or `'cowork'`) instead of always being `'claude'`.

## Routing

`listConversations`, `getConversationMessages`, and `listConversationsWithAnalysis` route to provider-specific indexers via the internal `ensureIndexed` helper:
- `provider === 'cowork'` → `ensureCoworkProjectIndexed(providerProjectDir, projectPath)`
- all others → `ensureProjectIndexed(providerProjectDir)`

## Exports

### `const projectHandlers`

```ts
export const projectHandlers: HandlerRegistry
```
