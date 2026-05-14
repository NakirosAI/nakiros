# Standard.tsx

**Path:** `apps/landing/src/components/Standard.tsx`

Renders the "Standardized" section (section 03, v2 landing layout) — a two-panel layout. Left panel is a spec-check table (check name, pass count, fail count, validation description). Right panel lists proof URLs as external-link pills plus a "schema versioned. tracked." callout. All copy from `messages.standard`.

## Exports

### `Standard`

```ts
export function Standard(): JSX.Element
```

"Standardized" section — spec-check table with pass/fail counts and a proof side panel listing versioned schema URLs. Occupies section 03 of the v2 landing layout.

Left panel renders `messages.standard.checks` as a four-column table (check name, pass count, fail count, validation description). Right panel lists `messages.standard.proofItems` as external-link pills plus a "schema versioned. tracked." callout chip.
