# classify-convo-runner.ts

**Path:** `apps/nakiros/src/services/classify-convo-runner.ts`

Runner for the V1.1 friction-classification run kind (`kind = 'classify-convo'`). Builds a
dense conversation digest, estimates input tokens, selects Haiku or Sonnet based on size
(≤170k tokens → Haiku, otherwise Sonnet), then calls the `nakiros-conversation-classifier`
skill inline (SKILL.md content inlined into the prompt — not via `Skill()` tool). The
classifier output is parsed by `classifier-parser.ts` and persisted as a `ConversationDigest`
JSON under `~/.nakiros/ingest/projects/<encoded>/digests/<sessionId>.json`.

Workdir: `~/.nakiros/runs/classify-convo/<runId>/`.
Broadcasts: `classifyConvo:event` via `eventBus.broadcast`.

The run lifecycle mirrors `analyzeConvo` so the frontend can share the RunSidePanel consumer
pattern. `sourceSessionId` is a distinct field from `sessionId` (the sub-run's Claude session)
to avoid the runner-core overwrite gotcha.

## Exports

The runner exports follow the standard runner pattern:

- `startClassifyConvo` — start a classify-convo run; builds digest + prompt, spawns agent
- `stopClassifyConvo` — stop an active run
- `getClassifyConvoRun` — fetch current run state by runId
- `getClassifyConvoExtras` — fetch the extras (projectPath, providerProjectDir, prompt) for resume turns
- `sendClassifyConvoUserMessage` — send a follow-up message into an interactive run
- `finishClassifyConvo` — mark a waiting-for-input run as complete; persists the parsed digest
- `listActiveClassifyConvoRuns` — list non-terminal runs
- `listAllClassifyConvoRuns` — list all runs (including terminal)
- `getClassifyConvoBufferedEvents` — flush events buffered since last poll
