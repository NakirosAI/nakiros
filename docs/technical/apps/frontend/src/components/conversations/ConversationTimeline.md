# ConversationTimeline.tsx

**Path:** `apps/frontend/src/components/conversations/ConversationTimeline.tsx`

The key visualization of the diagnostic panel: shows context-size growth over the conversation against the "lost in the middle" danger zones of the active window. Zones are horizontal bands (green 0-25 %, amber 25-75 %, red 75-100 %). Compactions get purple flags; friction events sit below the axis as red triangles, so the eye can correlate frustration with dangerous zones.

The sparkline is downsampled (max ~180 samples) and drawn as coloured segments tinted by the zone the endpoint falls into.

## Exports

### `ConversationTimeline`

```ts
export function ConversationTimeline(props: { analysis: ConversationAnalysis }): JSX.Element
```

Pure SVG render — no interactivity beyond hover tooltips on compactions/frictions. Inline-tunable constants (`HEALTHY_PCT`, `WATCH_PCT`, `MAX_SAMPLES`) must stay in sync with the analyzer's zone thresholds.

```ts
interface Props {
  analysis: ConversationAnalysis;
}
```
