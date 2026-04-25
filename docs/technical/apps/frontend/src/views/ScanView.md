# ScanView.tsx

**Path:** `apps/frontend/src/views/ScanView.tsx`

First-run / boot-time view that scans `~/.claude/projects/` for Claude Code project sessions, displays per-project progress, and lets the user dismiss unwanted entries before continuing into the app. Subscribes to `window.nakiros.onScanProgress` for live progress updates, triggers the scan via `scanProjects`, and removes individual entries via `dismissProject`. Mounted by `App.tsx` between `Onboarding` and `Home`.

## Exports

### `default` — `ScanView`

```ts
export default function ScanView(props: ScanViewProps): JSX.Element
```

Renders the scan header, animated progress bar, the discovered project list with dismiss buttons, and a "Continue" footer once the scan completes. Props: `{ onComplete: (projects: Project[]) => void }`.
