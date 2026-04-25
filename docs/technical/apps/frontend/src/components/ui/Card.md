# Card.tsx

**Path:** `apps/frontend/src/components/ui/Card.tsx`

Composable card surface used throughout the Nakiros frontend. Each part (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) is a thin themed `<div>`/`<p>` and they are designed to be combined.

## Exports

### `Card`

```ts
function Card(props: React.ComponentProps<'div'>): JSX.Element
```

Top-level rounded, bordered container with the Nakiros card background and elevated shadow.

### `CardHeader`

```ts
function CardHeader(props: React.ComponentProps<'div'>): JSX.Element
```

Header slot that stacks `CardTitle` + `CardDescription` with consistent padding.

### `CardTitle`

```ts
function CardTitle(props: React.ComponentProps<'div'>): JSX.Element
```

Heading text inside `CardHeader`. Renders a `<div>` (not a heading element) styled as a tracked, bold title.

### `CardDescription`

```ts
function CardDescription(props: React.ComponentProps<'p'>): JSX.Element
```

Muted secondary text inside `CardHeader`, typically a subtitle.

### `CardContent`

```ts
function CardContent(props: React.ComponentProps<'div'>): JSX.Element
```

Body slot. Holds the main content with horizontal padding and bottom padding (no top padding — sits flush below `CardHeader`).

### `CardFooter`

```ts
function CardFooter(props: React.ComponentProps<'div'>): JSX.Element
```

Footer slot. Lays out trailing actions (buttons, links) in a horizontal flex row.
