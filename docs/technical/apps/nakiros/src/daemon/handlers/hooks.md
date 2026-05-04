# hooks

**Path:** `apps/nakiros/src/daemon/handlers/hooks.ts`

IPC handler bundle for the `nakiros-hooks-expert` audit/fix/create flow. Exposes 4 channels that operate on the `hooks` block of a project's `.claude/settings.json` as a JSON string.

**NOTE:** These `hooks:*` channels are **distinct** from `claudeHooks:*` (Module 6 V2 structured hooks editor). The `hooks:*` channels expose a JSON-string-level read/save interface used by the expert skill, while `claudeHooks:*` provides a structured per-event editor for the frontend UI.

## IPC channels

- `hooks:read` — read the hooks block from `.claude/settings.json` as pretty-printed JSON
- `hooks:save` — merge a new hooks block into settings.json (optimistic-lock, preserves all other keys)
- `hooks:listAudits` — list archived hooks audit reports for a project (newest-first)
- `hooks:readAudit` — read an archived audit markdown report by absolute path (path-traversal guarded)

## Exports

### `hooksHandlers`

```ts
export const hooksHandlers: HandlerRegistry
```

Handler registry map covering the 4 `hooks:*` channels. Registered into the global IPC registry by `handlers/index.ts`.

Each handler is created with `createTypedHandler` to eliminate manual `args[n] as T` casts. All four handlers resolve the project via `getProject(projectId)` and return a typed error payload rather than throwing when the project is not found.

`hooks:save` additionally enforces an optimistic-lock check (mtime at read vs current mtime) before writing, and returns `{ ok: false, code: 'conflict' }` when the file was modified externally since the last read. An empty JSON string or `"{}"` removes the `hooks` key entirely from settings.json rather than writing an empty object.

`hooks:readAudit` applies a path-traversal guard — only paths under `~/.nakiros/` are allowed through; anything else returns `null` without I/O.
