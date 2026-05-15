# TokenSandbox

**File:** `apps/frontend/src/components/_dev/TokenSandbox.tsx`

## Overview

Dev-only visual sandbox for the new-design OKLch token set. Surfaces every `--n-*` CSS variable and its corresponding Tailwind utility so designers can validate the palette before any screen is migrated.

**Access:** append `?dev=tokens` to the URL. The component is not used in production builds.

## Exports

### `TokenSandbox` (default export)

```tsx
export default function TokenSandbox(): JSX.Element
```

Renders a full-page grid of:
- Surface backgrounds (`bg-n-canvas`, `bg-n-surface`, `bg-n-raised`, `bg-n-sunken`)
- Semantic text colours (`text-n-fg`, `text-n-muted`, `text-n-faint`)
- Semantic accent/status tones (healthy, watch, critical, info, violet)
- Border tokens
- Shadow / glow tokens
- `HBar` and `Sparkline` live previews at various densities

Density picker (`standard` / `compact` / `comfy`) sets `data-density` on the wrapper so the grid reflects all three layout modes simultaneously.
