# FixReviewPanel.tsx

**Path:** `apps/frontend/src/components/fix/FixReviewPanel.tsx`

Renders the diff between the original skill and what the fix/create runner produced in its sandbox. Fetches the file list lazily via the IPC client (`listFixDiff` or `listCreateDiff` depending on `mode`), then delegates to `SkillDiffView` for the side-by-side rendering. Cache is scoped by `mode:runId:refreshKey` so a new agent turn (which bumps `refreshKey`) forces a clean re-fetch.

## Exports

### `FixReviewPanel` (default export)

```ts
export default function FixReviewPanel(props: { runId: string; mode: 'fix' | 'create'; refreshKey: string }): JSX.Element
```

Loading / error / empty / loaded states, all i18n-backed via the `fix` namespace. The labels object passed to `SkillDiffView` is built locally so this component owns the wording for review surfaces.

```ts
interface Props {
  runId: string;
  mode: 'fix' | 'create';
  /** Changing this invalidates the diff cache so the panel re-fetches. */
  refreshKey: string;
}
```
