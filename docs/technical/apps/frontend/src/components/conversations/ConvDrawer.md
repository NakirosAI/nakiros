# ConvDrawer

**File:** `apps/frontend/src/components/conversations/ConvDrawer.tsx`

## Overview

Slide-in drawer rendered on top of `ConversationsScreen`. Shows a single conversation's detailed analysis in three sub-tabs: **Transcript**, **Diagnostic**, and **Frictions**. The drawer slides in from the right using a CSS transition; the backdrop click closes it.

i18n namespace: `conversations`.

## Exports

### `ConvDrawer`

```tsx
export function ConvDrawer(props: {
  analysis: ConversationAnalysis;
  projectId: string;
  onClose(): void;
  onOpenRunTab?: OpenRunTabCallback;
}): JSX.Element
```

Props are not exported as a named interface — destructured inline. Fetches `ConversationMessage[]` via `useConversationMessages` (IPC: `getProjectConversationMessages`) and the friction digest via `window.nakiros.getConversationDigest`.
