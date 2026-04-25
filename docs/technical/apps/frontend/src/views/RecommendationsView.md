# RecommendationsView.tsx

**Path:** `apps/frontend/src/views/RecommendationsView.tsx`

Placeholder dashboard tab for the upcoming "Insights" / proposal-engine surface (friction → skill recommendations). Currently renders only a header and a "coming soon" notice for the active project; reached via `DashboardRouter` → "recommendations" route.

## Exports

### `default` — `RecommendationsView`

```ts
export default function RecommendationsView(props: Props): JSX.Element
```

Renders a centered icon, title, body copy mentioning the project, and a "coming soon" pill. Props: `{ project: Project }`.
