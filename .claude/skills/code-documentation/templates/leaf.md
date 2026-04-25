# {file-name}

**Path:** `{source-path-from-repo-root}`

{One-paragraph purpose — what this file does in the project. 2–4 sentences max. Human-readable.}

{IF file is an IPC handler (under apps/nakiros/src/daemon/handlers/):}

## IPC channels

- `{channel:name}` — {one line: what it does}
- `{channel:name}` — {…}

{Broadcasts, if any:}
- `{event:name}` — {when it fires}

{END IPC section}

## Exports

### `{symbol-name}`

{Signature, fenced as ts:}

```ts
export function foo(a: number, b: string): Promise<Foo>
```

{Description reproduced from the TSDoc in the source file — purpose, side effects, context.}

**Parameters:**
- `a` — {param description from TSDoc}
- `b` — {param description from TSDoc}

**Returns:** {return description from TSDoc}

**Throws:** `{ErrorType}` — {when}  (omit this block if no @throws)

{Repeat one ### block per exported symbol, in source order.}

{For classes, list public methods as #### under the class ###:}

### `class Foo`

{class-level TSDoc description}

#### `method(args)`

{method signature + description + params + returns}

{For interface / type exports, use a compact format — the signature often IS the documentation:}

### `interface FooProps`

{one-line description}

```ts
export interface FooProps {
  /** Description of id. */
  id: string
  /** Description of onClick. Default: noop. */
  onClick?: () => void
}
```

---

{If the file only re-exports:}

## Re-exports

- `foo` — see [other/file.md](../other/file.md)
- `bar` — see [other/file.md](../other/file.md)
