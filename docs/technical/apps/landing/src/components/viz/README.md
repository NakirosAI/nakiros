# viz/

**Path:** `apps/landing/src/components/viz/`

Presentational SVG visualisation primitives used across the landing page sections. All three components are purely visual (no state, no i18n), accept numeric props, and are `aria-hidden`. They use CSS custom properties (`var(--*)`) for colours so they respond to the landing theme automatically.

## Files

- [ScoreRing.tsx](./ScoreRing.md) — Circular SVG ring encoding a numeric score as an arc fill; used in the Factory section skill table.
- [Sparkline.tsx](./Sparkline.md) — Minimal SVG sparkline for trend data; used in the Factory section skill table.
- [SpecDonut.tsx](./SpecDonut.md) — Two-colour donut chart showing pass/fail spec check ratio; used in the Room section tree panel.
