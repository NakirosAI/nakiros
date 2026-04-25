# Modal.tsx

**Path:** `apps/frontend/src/components/ui/Modal.tsx`

Lightweight controlled modal dialog used across the Nakiros frontend (skill creation, evaluation forms, confirmations, etc.). Not portalled — relies on `position: fixed` + a high z-index to overlay the app shell.

## Exports

### `ModalSize`

```ts
export type ModalSize = 'sm' | 'md' | 'lg'
```

Width preset applied to the modal panel (`max-w-md` / `max-w-2xl` / `max-w-4xl`).

### `Modal`

```ts
export function Modal(props: ModalProps): JSX.Element | null
```

Renders nothing when `isOpen` is false. Escape key and (optionally) overlay clicks call `onClose`. Adds/removes a `keydown` listener on `window` for the lifetime of the open modal.

**Parameters:**
- `isOpen` — controls visibility.
- `onClose` — called on Escape, on overlay click (when allowed) and on close-button click.
- `title` — optional ReactNode rendered in the modal header.
- `size` — preset width (`'md'` by default).
- `showCloseButton` — when true, renders an `×` button in the header (default `true`).
- `closeOnOverlayClick` — when true, clicking the backdrop closes the modal (default `true`).
- `children` — modal body content.
