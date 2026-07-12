# NewRunHeader.tsx

**Path:** `apps/frontend/src/components/runs/NewRunHeader.tsx`

New-design run header — port of `RunHeader` in
`apps/Nakiros-new-design/screens-runs.jsx:3-94`. Renders the kind pill,
status tone, title, contextual stats, and the action buttons available in
the current state. The bottom progress bar appears only while the run is
`running` / `pending`.

Visual is fully OKLch (font-n-mono labels, OKLch tones for status, shimmer
overlay on the progress bar) so the header sits naturally inside the new
shell.

The module-local `kindVisual(kind: AgentRunKind)` switch has a `'bootstrap'`
case (Rocket icon, `--n-accent`, matching the sidebar nav item and
`RunDock`'s own `kindVisual`) added purely as defense in depth — a
bootstrap run should never actually reach this header in practice, since
`NewShell.handleOpenRun` routes it to `views/BootstrapScreen.tsx` instead of
ever opening the `kind: 'run'` tab this header is rendered for. Without that
case a bootstrap run landing here (e.g. if that routing guarantee were ever
bypassed) would fall through to the generic `GitCompare` icon.

## Exports

### `NewRunHeader` (default export)

```ts
export default function NewRunHeader(props: NewRunHeaderProps): JSX.Element
```

**Props** (`NewRunHeaderProps`, not exported — local to this file):
- `kind` / `status` — drive the kind pill and status tone.
- `title` / `kindLabelOverride?` — main heading and optional chip override (e.g. "Audit CLAUDE.md").
- `stats?` — right-aligned `{label, value}` pairs (tokens, elapsed, …).
- `onBack?` / `onStop?` / `onFinish?` — header actions; visibility follows `status`.
- `isStopping?` — spinner + disabled state on the Stop button.
- `progressPct?` / `stepTotal?` / `stepDone?` — drive the bottom progress bar and "step N/M" caption.
- `onLaunchEval?` / `isLaunchingEval?` / `evalsButtonVisible?` — the "Run evals" action between Stop and Finish.
