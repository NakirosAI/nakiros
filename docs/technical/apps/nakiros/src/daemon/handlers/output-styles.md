# output-styles.ts

**Path:** `apps/nakiros/src/daemon/handlers/output-styles.ts`

Registers `outputStyles:*` channels for the `nakiros-output-styles-expert` audit/fix flow.
Supports recursive discovery of `.md` files under `.claude/output-styles/` (sub-folders OK).
Path-traversal is rejected at the handler boundary. Audit history is served from
`~/.nakiros/<projectId>/output-styles-audits/<encoded-styleName>/`.

**Note:** These channels are distinct from `claudeOutputStyles:*` (Module 3 V2 form editor). The path-resolution and write logic behind `outputStyles:save` now live in [`output-styles-writer.ts`](../../services/output-styles-writer.md) (`resolveStylePath`, `writeOutputStyleFile`) — extracted so the bootstrap dispatch (`bootstrap-dispatch.ts`) can reuse the exact same write path instead of forking a variant.

## IPC channels

- `outputStyles:list` — returns `OutputStylesExpertListResult` with metadata for every style
- `outputStyles:read` — returns `OutputStylesReadResult` (content + mtime + exists) for one style
- `outputStyles:save` — write a style with mtime conflict detection; returns `OutputStylesExpertMutationResult`
- `outputStyles:delete` — delete a style file; returns `OutputStylesExpertMutationResult`
- `outputStyles:listAudits` — returns `OutputStylesAuditHistoryEntry[]` for a style, newest-first
- `outputStyles:readAudit` — read a single archived audit report by absolute path

## Exports

### `outputStylesHandlers`

```ts
export const outputStylesHandlers: HandlerRegistry
```

Handler map merged into the global registry by `buildHandlerRegistry()`.
