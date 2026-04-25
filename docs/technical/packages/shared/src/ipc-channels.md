# ipc-channels.ts

**Path:** `packages/shared/src/ipc-channels.ts`

Canonical IPC channel registry shared between the daemon, the HTTP client used by the frontend, and `global.d.ts`. Every handler, client call, and type declaration MUST reference names from this map — no hardcoded channel strings elsewhere. This rule is enforced by `CLAUDE.md`.

## IPC channels

Channels are grouped by domain. Each key equals its value so the object acts as a string enum while giving the compiler stable literal-type inference.

### Generic / Meta / Preferences

- `shell:openPath` — open a file or URL with the OS handler
- `meta:getVersionInfo` — returns current + latest Nakiros version
- `preferences:get`, `preferences:getSystemLanguage`, `preferences:save`

### Onboarding

- `onboarding:detectEditors`, `onboarding:install`
- `onboarding:nakirosConfigExists`, `onboarding:progress`

### Agent installer (skill commands)

- `agents:cli-status`, `agents:global-status`, `agents:installed-commands`
- `agents:install`, `agents:install-global`, `agents:status`

### Project management

- `project:scan` / `project:scanProgress` — walk provider dirs to detect projects
- `project:list`, `project:get`, `project:dismiss`
- `project:getStats`, `project:getGlobalStats`
- Conversations: `project:listConversations`, `project:getConversation`, `project:getConversationMessages`, `project:analyzeConversation`, `project:listConversationsWithAnalysis`, `project:deepAnalyzeConversation`, `project:loadDeepAnalysis`
- Skills: `project:listSkills`, `project:getSkill`, `project:saveSkill`, `project:readSkillFile`, `project:saveSkillFile`, `project:getRecommendations`

### Bundled skills (Nakiros ROM)

- `nakiros:listBundledSkills`, `nakiros:getBundledSkill`
- `nakiros:readBundledSkillFile`, `nakiros:saveBundledSkillFile`
- `nakiros:promoteBundledSkill`
- Conflicts: `nakiros:listBundledSkillConflicts`, `nakiros:resolveBundledSkillConflict`, `nakiros:readBundledSkillConflictDiff`

### Unified binary reader

- `skill:readFileAsDataUrl` — cross-scope binary/asset reader

### User-global + plugin skills

- `claudeGlobal:listSkills`, `claudeGlobal:getSkill`, `claudeGlobal:readSkillFile`, `claudeGlobal:saveSkillFile`
- `pluginSkills:list`, `pluginSkills:getSkill`, `pluginSkills:readSkillFile`, `pluginSkills:saveSkillFile`

### Eval runner

- `eval:startRuns`, `eval:stopRun`, `eval:listRuns`, `eval:loadPersisted`, `eval:finishRun`
- Stream: `eval:event`, `eval:getBufferedEvents`, `eval:sendUserMessage`
- Feedback: `eval:getFeedback`, `eval:saveFeedback`
- Outputs: `eval:listOutputs`, `eval:readOutput`, `eval:readDiffPatch`
- Matrix: `eval:getMatrix`, `eval:loadIterationRun`

### Eval model comparison (A/B/C)

- `comparison:run`, `comparison:list`, `comparison:getMatrix`, `comparison:getFingerprintStatus`

### Audit runner

- `audit:start`, `audit:stopRun`, `audit:getRun`, `audit:sendUserMessage`, `audit:finish`
- `audit:listHistory`, `audit:readReport`
- Stream: `audit:event`, `audit:listActive`, `audit:getBufferedEvents`

### Fix runner

- `fix:start`, `fix:stopRun`, `fix:getRun`, `fix:sendUserMessage`, `fix:finish`
- Evals in temp: `fix:runEvalsInTemp`, `fix:getBenchmarks`
- Stream: `fix:event`, `fix:listActive`, `fix:getBufferedEvents`
- Diff preview: `fix:listDiff`, `fix:readDiffFile`

### Create runner (thin mirror of fix)

- `create:start`, `create:stopRun`, `create:getRun`, `create:sendUserMessage`, `create:finish`
- `create:event`, `create:listActive`, `create:getBufferedEvents`
- `create:listDiff`, `create:readDiffFile`

### Draft temp files (shared by fix + create)

- `skillAgent:listTempFiles`, `skillAgent:readTempFile`

## Exports

### `const IPC_CHANNELS`

The canonical map described above — keys equal values so the object acts as a string enum.

```ts
export const IPC_CHANNELS = { /* see full list above */ } as const;
```

### `type IpcChannel`

Union of every IPC channel key declared in `IPC_CHANNELS`.

```ts
export type IpcChannel = keyof typeof IPC_CHANNELS;
```
