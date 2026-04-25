# ConversationHealthBadges.tsx

**Path:** `apps/frontend/src/components/conversations/ConversationHealthBadges.tsx`

Small row of "why this conversation is flagged" badges. Only renders signals that are actually present — a clean conversation shows nothing. Severity (warning vs danger) escalates with magnitude (≥2 compactions, ≥3 frictions, ≥5 tool errors).

## Exports

### `ConversationHealthBadges`

```ts
export function ConversationHealthBadges(props: { analysis: ConversationAnalysis }): JSX.Element
```

Renders up to six badges: compactions, token zone (when not healthy), friction count, tool errors, cache misses (≥3), hot files. Labels resolved via `useTranslation('conversations')`.

```ts
interface Props {
  analysis: ConversationAnalysis;
}
```
