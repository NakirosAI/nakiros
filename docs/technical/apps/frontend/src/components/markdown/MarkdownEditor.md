# MarkdownEditor

**Path:** `apps/frontend/src/components/markdown/MarkdownEditor.tsx`

Reusable controlled markdown editor combining a Milkdown Crepe WYSIWYG surface with a Raw textarea fallback. The WYSIWYG ↔ Raw toggle is managed entirely in local state; the parent only deals in plain markdown strings via `value` / `onChange`. Used by the Edit tab of every `.claude/` entity screen (ClaudeMdScreen, and upcoming RulesScreen). The Milkdown Crepe CSS theme must be imported globally in `main.tsx` — this component does not self-import it to avoid duplication.

## Exports

### `MarkdownEditorProps`

Props for `MarkdownEditor`.

```ts
export interface MarkdownEditorProps {
  /** Markdown content (controlled). */
  value: string;
  /** Change handler — called with the new markdown string. */
  onChange: (next: string) => void;
  /** Optional className for the outermost wrapper. */
  className?: string;
  /** Optional placeholder shown in Raw mode textarea when empty. */
  placeholder?: string;
}
```

### `MarkdownEditor`

```ts
export function MarkdownEditor({
  value,
  onChange,
  className,
  placeholder,
}: MarkdownEditorProps): JSX.Element
```

Reusable WYSIWYG/Raw markdown editor built on Milkdown Crepe.

The component manages the WYSIWYG ↔ Raw toggle internally via local state; the parent only receives/provides a plain markdown string via `value` / `onChange`.

CSS: the Milkdown Crepe theme must be loaded globally (see `main.tsx` — `import './styles/milkdown-crepe.css'`). This component does NOT import it itself to avoid duplicate injections when rendered more than once.

**Parameters:**
- `value` — Markdown content (controlled).
- `onChange` — Change handler — called with the new markdown string.
- `className` — Optional className for the outermost wrapper.
- `placeholder` — Optional placeholder shown in Raw mode textarea when empty.
