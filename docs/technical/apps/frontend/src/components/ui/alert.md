# alert.tsx

**Path:** `apps/frontend/src/components/ui/alert.tsx`

Banner used to surface contextual feedback (info, errors). Shadcn/ui-flavoured component with two variants driven by `class-variance-authority`.

## Exports

### `Alert`

```ts
function Alert(props: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>): JSX.Element
```

Renders a `role="alert"` `<div>` styled by the variant recipe (`'default'` or `'destructive'`). Compose with `AlertTitle` and `AlertDescription`.

### `AlertTitle`

```ts
function AlertTitle(props: React.ComponentProps<'div'>): JSX.Element
```

Bold heading slot inside an `Alert`.

### `AlertDescription`

```ts
function AlertDescription(props: React.ComponentProps<'div'>): JSX.Element
```

Body slot inside an `Alert`, used for the descriptive text.
