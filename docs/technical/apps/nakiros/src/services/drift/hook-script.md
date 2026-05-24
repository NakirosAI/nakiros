# hook-script.ts

**Path:** `apps/nakiros/src/services/drift/hook-script.ts`

Source strings for the two CJS hook scripts that Nakiros writes to disk when the user enables drift detection hooks. Both scripts are self-contained (no external dependencies, only `node:*` builtins) and call `GET http://localhost:4242/api/drift?session=<id>` via `node:http`.

## Exports

### `HOOK_STOP_SCRIPT_SOURCE`

```ts
export const HOOK_STOP_SCRIPT_SOURCE: string
```

Source of `~/.nakiros/drift/hook-stop.cjs`. Registered as a Claude Code `Stop` hook. Reads stdin JSON, skips when `stop_hook_active === true` (re-fire guard), then calls the daemon. On drift detected, writes `{ systemMessage: "Nakiros — <message> <suggestion>" }` to stdout. Silent on all failure modes.

---

### `HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE`

```ts
export const HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE: string
```

Source of `~/.nakiros/drift/hook-userpromptsubmit.cjs`. Registered as a Claude Code `UserPromptSubmit` hook. Same daemon call as the Stop hook. On drift detected, writes `{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "..." } }` to stdout so Claude Code injects drift context into the agent's next turn.

---

## Env vars honoured by both scripts

| Var | Default | Purpose |
|-----|---------|---------|
| `NAKIROS_DAEMON_URL` | `http://localhost:4242` | Override daemon URL for testing |
| `NAKIROS_DRIFT_FORCE` | *(empty)* | Force a specific drift type (`loop`/`topic`/`context`) |
