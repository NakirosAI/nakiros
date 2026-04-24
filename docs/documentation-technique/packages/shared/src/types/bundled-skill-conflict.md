# bundled-skill-conflict.ts

**Path:** `packages/shared/src/types/bundled-skill-conflict.ts`

Conflict descriptors between the bundled Nakiros skill (ROM) and a user's locally-edited copy. Produced when the user upgrades Nakiros and a bundled skill they modified has also changed in the new version.

## Exports

### `interface BundledSkillConflict`

Conflict descriptor between the Nakiros bundled skill (ROM) and a user's live copy.

```ts
export interface BundledSkillConflict {
  skillName: string;
  /** Nakiros version the user last synced from. Null if no prior sync. */
  previousVersion: string | null;
  /** Nakiros version currently shipping the ROM. */
  currentVersion: string;
  userModifiedPaths: string[];
  romChangedPaths: string[];
  /** Paths modified in both — the real merge conflicts. */
  overlappingPaths: string[];
}
```

### `interface BundledSkillConflictFileDiff`

Per-file diff used to preview a bundled-skill conflict in the UI.

```ts
export interface BundledSkillConflictFileDiff {
  relativePath: string;
  /** ROM content. Null when the file was removed from ROM. */
  romContent: string | null;
  /** User's live content. Null when the file never existed locally. */
  liveContent: string | null;
  isBinary: boolean;
}
```

### `type BundledSkillConflictResolution`

Resolution strategy picked by the user for a bundled-skill conflict:
- `apply-rom` — overwrite user copy with the ROM version
- `keep-mine` — discard ROM changes, keep the local copy
- `promote-mine` — turn the local copy into a new user-owned skill

```ts
export type BundledSkillConflictResolution =
  | 'apply-rom'
  | 'keep-mine'
  | 'promote-mine';
```
