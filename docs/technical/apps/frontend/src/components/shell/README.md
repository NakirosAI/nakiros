# shell/

**Path:** `apps/frontend/src/components/shell/`

The new-design app shell: the multi-tab main window (`NewShell`), its
project sidebar, topbar, and the cross-kind running-runs dropdown
(`RunDock`). Mounted once at the app root; every screen renders inside it.

This index currently only covers the files touched while wiring the
Project `.claude` Bootstrap kind into the topbar `RunDock` — `NewShellSidebar.tsx`
and `NewShellTopBar.tsx` predate this refresh and aren't documented yet.

## Files

- [NewShell.tsx](./NewShell.md) — Main Nakiros shell — tab strip, sidebar, and per-tab screen dispatch, driven by `useTabs`.
- [RunDock.tsx](./RunDock.md) — Topbar pill + dropdown listing every active/recent `AgentRun` regardless of kind, grouped by status.
