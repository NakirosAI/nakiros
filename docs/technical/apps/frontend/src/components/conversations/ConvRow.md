# ConvRow

**File:** `apps/frontend/src/components/conversations/ConvRow.tsx`

## Overview

A single row in the conversations list. Renders health tone, score, session id, last-message timestamp, compaction badge, and friction count. Clicking the row opens the `ConvDrawer`. Health is the dominant left-side signal (coloured indicator dot).

i18n namespace: `conversations`.

## Exports

### `ConvRow`

```tsx
export function ConvRow(props: {
  analysis: ConversationAnalysis;
  isSelected: boolean;
  onClick(): void;
}): JSX.Element
```

Props interface is internal (not exported).
