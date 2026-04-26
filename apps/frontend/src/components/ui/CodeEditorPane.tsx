import { forwardRef, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

/**
 * Props for {@link CodeEditorPane}. Inherits every standard
 * `<textarea>` attribute except `value` / `onChange`, which are tightened to
 * a string-in / string-out contract so callers don't need to dig into
 * `event.target.value`.
 */
export interface CodeEditorPaneProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  /** Current text content of the editor. */
  value: string;
  /** Called with the new value whenever the user edits the text. */
  onChange(value: string): void;
}

/**
 * Full-pane code editor surface — borderless, font-mono, fills its flex
 * parent. Distinct from the form-style {@link Textarea} (which lives inside a
 * `FormField` with label/hint/error). Use this for raw file editing where the
 * textarea IS the pane (skills views, future markdown sources, etc.).
 *
 * Forwards its ref so callers can imperatively focus / select.
 */
export const CodeEditorPane = forwardRef<HTMLTextAreaElement, CodeEditorPaneProps>(
  function CodeEditorPane({ value, onChange, className, spellCheck = false, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={spellCheck}
        className={clsx(
          'flex-1 resize-none border-none bg-[var(--bg)] p-4 font-mono text-sm text-[var(--text-primary)] outline-none',
          className,
        )}
        {...props}
      />
    );
  },
);
