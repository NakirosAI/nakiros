# file-types.ts

**Path:** `apps/frontend/src/utils/file-types.ts`

MIME-like classification for skill asset files displayed in the UI.

## Exports

### `isImagePath`

```ts
function isImagePath(path: string): boolean;
```

True when `path` ends with `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`,
`ico`, `bmp`, or `avif` (case-insensitive on the extension).
