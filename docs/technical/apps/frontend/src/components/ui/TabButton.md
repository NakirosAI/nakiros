# TabButton.tsx

**Path:** `apps/frontend/src/components/ui/TabButton.tsx`

Segmented-control tab button with filled active state — used for in-page tab groups where the active tab gets a `bg-[var(--bg-muted)]` fill rather than an underline. For top-level page navigation prefer the Radix-based `Tabs` family in `tabs.tsx`.

## Exports

### `function TabButton`

```ts
export function TabButton(props: {
  active: boolean;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
}): JSX.Element
```

Renders a horizontal pill-style button. Pair with sibling `TabButton`s inside a flex container to build a segmented control. The visual style is intentionally distinct from the underline tabs (`tabs.tsx`) so the two surfaces stay distinguishable.
