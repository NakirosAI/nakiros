# ids.ts

**Path:** `apps/frontend/src/utils/ids.ts`

Short unique-id generator backed by `crypto.randomUUID()`.

## Exports

### `uid`

```ts
function uid(): string;
```

Returns an 8-char hexadecimal string derived from a UUID. Suitable for
ephemeral local keys (React lists, transient ids) — not for security.
