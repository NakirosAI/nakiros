# recommendations/

**Path:** `apps/frontend/src/components/recommendations/`

React components for the friction-pattern recommendations screen. This folder implements the two-column layout (pattern list + pattern detail), the reco card renderer, the apply-confirmation modal, and the top-level screen that orchestrates them.

All components use `n-*` design tokens (no legacy CSS variables), native HTML elements, and the `recommendations` i18n namespace.

## Files

- [PatternList.tsx](./PatternList.md) — Left-column list of friction patterns with severity badges and analyser-run status hints.
- [RecoCard.tsx](./RecoCard.md) — Single recommendation card: header, MarkdownViewer body, and status-aware action buttons (Apply / Dismiss / Open run).
- [ApplyRecoModal.tsx](./ApplyRecoModal.md) — Confirmation modal before applying a reco; lets the user edit the brief text before it is sent to the downstream runner.
- [PatternDetail.tsx](./PatternDetail.md) — Right-side detail panel for a selected pattern: header summary, Analyze button, live-updated list of reco cards.
- [RecsScreen.tsx](./RecsScreen.md) — Top-level two-column screen that owns the pattern list state and connects PatternList with PatternDetail.
