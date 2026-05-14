# hook-script

**Path:** `apps/nakiros/src/services/conversation-ingest/hook-script.ts`

Source template for `~/.nakiros/ingest/hook-stop.cjs` — the tiny CommonJS script Claude Code invokes from its Stop hook. Kept self-contained (no `require` outside `node:*` builtins) so it has no install-time dependency surface and runs in <50ms even on cold node starts.

## Exports

### `HOOK_STOP_SCRIPT_SOURCE`

```ts
export const HOOK_STOP_SCRIPT_SOURCE: string
```

Inline source of the Stop hook CJS script that `installHook()` writes to `~/.nakiros/ingest/hook-stop.cjs`. The script reads a JSON payload from stdin (Claude Code Stop hook convention), appends it to `~/.nakiros/ingest/queue/` via atomic rename, and exits cleanly — it never imports from the daemon process.
