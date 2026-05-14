# Local.tsx

**Path:** `apps/landing/src/components/Local.tsx`

Renders the "Local-first" section (section 07, v2 landing layout) — two-column layout with a numbered bullet list and a SVG network diagram (`NetworkDiagram`). Emphasises the no-cloud, no-API-key guarantee. All copy from `messages.local`.

## Exports

### `Local`

```ts
export function Local(): JSX.Element
```

"Local-first" section — two-column layout with a bullet-point list and the `NetworkDiagram` SVG. Occupies section 07 of the v2 landing layout.

Left column renders `messages.local.points` as a numbered list emphasising the no-cloud, no-API-key guarantee. Right column renders the interactive SVG diagram showing nakirosd at the centre of the local architecture.
