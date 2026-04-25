# skill-diff.ts

**Path:** `packages/shared/src/types/skill-diff.ts`

Shapes for reviewing the diff between a skill's real on-disk state and an in-progress edit produced by a fix or create run.

## Exports

### `interface SkillDiffEntry`

One entry in the diff listing between the original skill and the in-progress edit.

```ts
export interface SkillDiffEntry {
  relativePath: string;
  /** True if the file exists on the original (pre-edit) side. */
  inOriginal: boolean;
  /** True if the file exists on the modified (post-edit) side. */
  inModified: boolean;
}
```

### `interface SkillDiffFilePayload`

Full content payload for a single file diff, consumed by the review UI.

```ts
export interface SkillDiffFilePayload {
  relativePath: string;
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}
```
