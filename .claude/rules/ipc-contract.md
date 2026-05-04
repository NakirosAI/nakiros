---
paths:
  - "packages/shared/src/ipc-channels.ts"
  - "packages/shared/src/types/**"
  - "apps/nakiros/src/daemon/handlers/**"
  - "apps/frontend/src/lib/nakiros-client.ts"
  - "apps/frontend/src/global.d.ts"
---

# Rule — IPC contract sync

The IPC contract between daemon and frontend is **load-bearing**. Any new or
changed channel must update **all four** of these files in lockstep — no
exceptions, no shortcuts.

## The four files

1. **`packages/shared/src/ipc-channels.ts`** — declare the channel name in
   `IPC_CHANNELS` (the single source of truth).
2. **`apps/nakiros/src/daemon/handlers/index.ts`** — register the handler
   in the registry, plus the matching `handlers/<domain>.ts` implementation.
3. **`apps/frontend/src/lib/nakiros-client.ts`** — add the typed client
   method that calls the channel.
4. **`apps/frontend/src/global.d.ts`** — declare the matching method on
   `window.nakiros`.

If you change a channel signature, all four must be updated. If only one is
updated, the type-check fails or the call fails at runtime — both are bad,
but silent runtime failures are worse.

## Hard rules

- **Never hardcode a channel name string** anywhere. Always import from
  `IPC_CHANNELS`. No `'classify-convo:start'` literals in handlers, registry,
  client, or `d.ts`.
- **Channel names are stable.** Renaming a channel is a breaking change that
  affects every running session. If you must rename, do it across all four
  files in one commit.
- **Payload types live in `packages/shared/src/types/`.** Reuse existing
  types over inventing new ones.

## Validation

After any IPC change:

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
```

Both must pass — they are the contract enforcement.
