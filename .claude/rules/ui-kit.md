---
paths:
  - "apps/frontend/src/components/**/*.tsx"
  - "apps/frontend/src/views/**/*.tsx"
---

# Rule — UI kit usage on the new design

The new design (`NewShell` and everything under `components/shell/`,
`components/skill/`, screens that render inside the new shell) uses
**`n-*` design tokens** in Tailwind. The legacy CSS variables
(`--text`, `--bg-soft`, `--line`, etc.) are NOT defined in this design
context, which makes some `components/ui/*` parts visually broken.

## Safe to use everywhere

- `MarkdownViewer` — mandatory for any markdown content (see
  `markdown-rendering.md`)
- `Card`, `Badge`, `TabButton`, `tabs`, `tooltip`, `scroll-area`,
  `separator`, `progress`, `alert`
- `EmptyState`, `LoadingState`, `FormField`

## Do NOT use on the new design

These components hardcode legacy CSS vars and break visually:

- `Input`
- `Select`
- `Textarea`
- `Button`
- `Modal`
- `Checkbox`
- `CodeEditorPane`

Use native HTML elements with Tailwind `n-*` tokens instead:

```tsx
<input
  type="text"
  className="px-3 py-2 rounded-md bg-n-bg-soft text-n-text border border-n-line focus:outline-none focus:ring-2 focus:ring-n-accent"
/>
```

For buttons:

```tsx
<button
  type="button"
  className="px-4 py-2 rounded-md bg-n-accent text-white hover:bg-n-accent-hover"
>
  {t('save')}
</button>
```

## Adding new shared components

If you find yourself styling the same input/button pattern in 3+ places,
extract it into `components/shell/` (or a sibling new-design folder) — not
into `components/ui/`, which is the legacy zone.

## Tailwind-first

No inline `style={{...}}` unless unavoidable (e.g., dynamic `transform:
translateX(${px}px)`) AND documented with a one-line comment. Static styling
goes through Tailwind classes.
