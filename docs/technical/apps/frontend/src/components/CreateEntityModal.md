# CreateEntityModal

**File:** `apps/frontend/src/components/CreateEntityModal.tsx`

## Overview

"Create with AI" modal shared across Rules, Subagents, and Output Styles screens. Provides a text input for a name/description and a primary CTA that triggers an AI-guided creation run. Falls back gracefully when `aiAvailable` is `false` (hides the AI button).

## Exports

### `CreateEntityModalProps`

```ts
interface CreateEntityModalProps {
  value: string;
  error?: string;
  launchingAi: boolean;
  aiAvailable: boolean;
  onChange(value: string): void;
  onCancel(): void;
  onCreateWithAi(): void;
  labels: {
    title: string;
    placeholder: string;
    confirmAi: string;
    cancel: string;
  };
}
```

### `CreateEntityModal` (default export)

```tsx
export default function CreateEntityModal(props: CreateEntityModalProps): JSX.Element
```

Full-screen overlay with a name `<input>` and an "Create with AI" button. Pressing Enter submits the form. The `labels` object is passed by each entity screen so the modal text stays generic.
