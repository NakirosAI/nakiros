# skills-common.ts

**Path:** `apps/nakiros/src/daemon/handlers/skills-common.ts`

Registers the cross-scope `skill:*` binary/asset reader — a unified way for the UI to render images (and other whitelisted MIME types) inside any skill regardless of its scope.

## IPC channels

- `skill:readFileAsDataUrl` — returns a `data:<mime>;base64,...` URL or `null`. Supports `png`, `jpg`/`jpeg`, `gif`, `webp`, `svg`, `ico`, `bmp`, `avif`. Refuses paths that escape the skill directory (no directory traversal).

## Exports

### `const skillsCommonHandlers`

```ts
export const skillsCommonHandlers: HandlerRegistry
```
