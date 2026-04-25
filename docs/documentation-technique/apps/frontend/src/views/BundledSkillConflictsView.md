# BundledSkillConflictsView.tsx

**Path:** `apps/frontend/src/views/BundledSkillConflictsView.tsx`

Full-screen conflict resolution UI shown when a bundled (Nakiros-shipped) skill upgrade collides with the user's local edits in `~/.claude/skills/`. For each conflict the user can compare ROM (incoming bundled) vs LIVE (their edits) per file via `SkillDiffView`, then pick a resolution strategy (`apply-rom`, `keep-mine`, `promote-mine`) which is committed via `window.nakiros.resolveBundledSkillConflict`. Diff payloads come from `readBundledSkillConflictDiff`. Mounted from `App.tsx` when the daemon surfaces pending conflicts on startup.

## Exports

### `default` — `BundledSkillConflictsView`

```ts
export default function BundledSkillConflictsView(props: Props): JSX.Element | null
```

Renders the conflicts list (sidebar) plus the active conflict's resolution actions and per-file diff. Returns `null` when `conflicts` is empty. Notifies the parent through `onResolved(skillName)` after each successful resolution and `onClose()` when dismissed.
