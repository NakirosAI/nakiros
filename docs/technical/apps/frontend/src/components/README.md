# components/

**Path:** `apps/frontend/src/components/`

React components consumed by the views layer. Top-level files are app-shell pieces (sidebar, status bar, conversation turn renderer). Subfolders group components by feature area.

## Subfolders

- [conversations/](./conversations/README.md) — Components powering the per-conversation diagnostic panel and the project-scoped Insights aggregation.
- [dashboard/](./dashboard/README.md) — Shell-level pieces of the project dashboard (error boundary, router).
- [diff/](./diff/README.md) — Reusable side-by-side file-diff component used by fix and create review flows.
- [eval-matrix/](./eval-matrix/README.md) — Components composing the Evolution view and the Models comparison tab.
- [fix/](./fix/README.md) — Components specific to the fix/create review flow.
- [skill/](./skill/README.md) — Components specific to the per-skill view.
- [ui/](./ui/README.md) — Themed UI primitives shared by every feature view (Tailwind + Radix).

## Files

- [ConversationTurn.tsx](./ConversationTurn.md) — Shared chat-style turn renderer used by every runner (eval, audit, fix).
- [Sidebar.tsx](./Sidebar.md) — Vertical icon-only navigation rail rendered on the left of the dashboard.
- [StatusBar.tsx](./StatusBar.md) — Thin footer strip showing daemon status and workspace summary.
- [ThinkingIndicator.tsx](./ThinkingIndicator.md) — Cycling "thinking" indicator shown while a runner is active but silent.
- [VersionIndicator.tsx](./VersionIndicator.md) — Pill showing the running CLI version with an upgrade flow when an npm update is available.
