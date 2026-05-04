---
paths:
  - "apps/nakiros/src/services/*runner*.ts"
  - "apps/nakiros/src/services/runner-core/**"
---

# Rule — Runners

Runners live in `apps/nakiros/src/services/*-runner.ts`. They orchestrate
calls to the Claude Code agent CLI and stream progress back to the UI.

## Reuse `runner-core/` first

`apps/nakiros/src/services/runner-core/` holds the shared primitives.
Anything common across runners (session JSONL parsing, billing math,
manifest writing, progress JSONL handling, sessionId tracking) lives here.

**Before writing a new runner**:

1. Open `docs/technical/apps/nakiros/services/runner-core/index.md`
   and skim the leaf docs.
2. Read the closest existing runner end-to-end.
3. Identify the 80% common path. If a primitive doesn't yet exist for it,
   add it to `runner-core/` and use it from both runners. Do not fork.

## The tmp_skill pattern (load-bearing)

Eval / fix / create runners operate on a **temporary copy** of the skill
under `~/.nakiros/runs/<runId>/...`, not on the real
`.claude/skills/<name>/`. The user's source is untouched until they hit
"Sync".

- Do **not** bypass the tmp_skill copy — if a runner edits the live skill
  directly, audits/evals can't be safely retried and the user can't reject
  changes.
- Workdir for any runner that writes files lives **outside `.claude/`**.
  Claude Code blocks writes inside `.claude/**` — sync-back is done by
  Nakiros directly, not by the agent.

## Event broadcasting

Runners emit progress via `eventBus.broadcast(channel, payload)` from
`apps/nakiros/src/daemon/event-bus.ts`. **Never import from `electron`** —
it's gone. Channels come from `IPC_CHANNELS` (see `ipc-contract.md`).

## Session ID tracking

`runner-core` overwrites `BaseRun.sessionId` with the sub-run's
`sessionClaudeId` on the first stream event. For run kinds that are
**conversation-bound** (e.g., classify-convo where the input session is
itself a claude session), add a separate `sourceSessionId` field to the
run type. Do not rely on `sessionId` to mean "the source conversation".

## Skill tool isolation

The `Skill()` tool spawns a sub-context that does **not** inherit the
parent's `<input>` blocks. If a runner needs a skill to act on a long input,
**inline the skill content** (read `SKILL.md` + referenced files,
concatenate into the user prompt) instead of invoking `Skill()`.

## Stop / failed race

If the user stops a run mid-flight, do not let it later transition to
`failed` — terminal states are sticky.

## Validation

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F nakiros build
```
