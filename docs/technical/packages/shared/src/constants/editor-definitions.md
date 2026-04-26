# editor-definitions.ts

**Path:** `packages/shared/src/constants/editor-definitions.ts`

Source-of-truth metadata for every editor environment Nakiros integrates with. Two installers consume this — the onboarding flow (global, joined with `~`) and the per-repo installer (joined with the repo path) — so the label / marker / commands subdirectory is defined exactly once.

## Exports

### `interface EditorDefinition`

Static metadata for one editor/agent environment.

```ts
export interface EditorDefinition {
  id: EditorId;
  /** Human-readable label shown to the user. */
  label: string;
  /** Marker directory relative to a base path (`~` for global, repo root for per-repo). */
  homeMarkerRelative: string;
  /** Subdirectory under `homeMarkerRelative` that holds the Nakiros command/prompt files. */
  commandsSubdir: string;
}
```

### `const EDITOR_DEFINITIONS`

Source-of-truth definitions for every supported editor environment, keyed by `EditorId`.

```ts
export const EDITOR_DEFINITIONS: Record<EditorId, EditorDefinition>
```

### `const EDITOR_DEFINITION_LIST`

Same data as `EDITOR_DEFINITIONS` but as a readonly array, iterated in declaration order. Useful when callers need to enumerate every environment.

```ts
export const EDITOR_DEFINITION_LIST: readonly EditorDefinition[]
```
