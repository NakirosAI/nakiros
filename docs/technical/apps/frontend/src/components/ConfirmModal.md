# ConfirmModal

**File:** `apps/frontend/src/components/ConfirmModal.tsx`

## Overview

Generic confirmation dialog built with n-* design tokens. Supports a destructive styling variant (red confirm button). Used before irreversible operations such as deleting a CLAUDE.md file or removing a rule.

## Exports

### `ConfirmModalProps`

```ts
interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** When `true` (default) the confirm button renders in critical red. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm(): void;
  onCancel(): void;
}
```

### `ConfirmModal` (default export)

```tsx
export default function ConfirmModal(props: ConfirmModalProps): JSX.Element | null
```

Renders `null` when `open` is `false`. When open, overlays a centred modal with a semi-transparent backdrop. The confirm button is disabled while `loading` is `true`. Focus is trapped inside the dialog while it is open.
