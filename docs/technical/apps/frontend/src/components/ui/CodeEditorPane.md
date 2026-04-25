# CodeEditorPane.tsx

**Path:** `apps/frontend/src/components/ui/CodeEditorPane.tsx`

Full-pane code editor surface — borderless, font-mono, fills its flex parent. Distinct from the form-style `Textarea` (which lives inside a `FormField` with label/hint/error). Use this for raw file editing where the textarea IS the pane (skills views, future markdown sources, etc.).

## Exports

### `CodeEditorPaneProps`

```ts
export interface CodeEditorPaneProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  /** Current text content of the editor. */
  value: string;
  /** Called with the new value whenever the user edits the text. */
  onChange(value: string): void;
}
```

Inherits every standard `<textarea>` attribute except `value` / `onChange`, which are tightened to a string-in / string-out contract so callers don't need to dig into `event.target.value`.

### `CodeEditorPane`

```ts
export const CodeEditorPane: ForwardRefExoticComponent<CodeEditorPaneProps & RefAttributes<HTMLTextAreaElement>>
```

Forwards its ref so callers can imperatively focus or select. `spellCheck` defaults to `false` (code editors should not spell-check). `className` is merged onto the default `flex-1 resize-none border-none bg-[var(--bg)] p-4 font-mono text-sm text-[var(--text-primary)] outline-none`.

Adopted by `SkillsView`, `GlobalSkillsView`, `NakirosSkillsView`, `PluginSkillsView`.
