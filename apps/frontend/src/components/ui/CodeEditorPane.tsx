import { forwardRef, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface CodeEditorPaneProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
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
