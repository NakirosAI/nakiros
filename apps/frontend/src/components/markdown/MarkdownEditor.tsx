import { useEffect, useRef, useState } from 'react';
import { Crepe } from '@milkdown/crepe';

/**
 * Props for {@link MarkdownEditor}.
 */
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

/**
 * Reusable WYSIWYG/Raw markdown editor built on Milkdown Crepe.
 *
 * The component manages the WYSIWYG ↔ Raw toggle internally via local state;
 * the parent only receives/provides a plain markdown string via `value` / `onChange`.
 *
 * CSS: the Milkdown Crepe theme must be loaded globally (see `main.tsx` —
 * `import './styles/milkdown-crepe.css'`). This component does NOT import it
 * itself to avoid duplicate injections when rendered more than once.
 */
export function MarkdownEditor({ value, onChange, className = '', placeholder }: MarkdownEditorProps) {
  const [useWysiwyg, setUseWysiwyg] = useState(true);

  return (
    <div className={`flex flex-col gap-1.5${className ? ` ${className}` : ''}`}>
      {/* Mode toggle header */}
      <div className="flex items-center rounded-n-sm border border-n-border-subtle bg-n-canvas p-0.5 self-start">
        <button
          type="button"
          onClick={() => setUseWysiwyg(true)}
          className={
            'rounded-n-xs px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
            (useWysiwyg
              ? 'bg-n-raised text-n-fg shadow-sm'
              : 'text-n-muted hover:text-n-fg')
          }
        >
          WYSIWYG
        </button>
        <button
          type="button"
          onClick={() => setUseWysiwyg(false)}
          className={
            'rounded-n-xs px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
            (!useWysiwyg
              ? 'bg-n-raised text-n-fg shadow-sm'
              : 'text-n-muted hover:text-n-fg')
          }
        >
          Raw
        </button>
      </div>

      {useWysiwyg ? (
        <CrepeEditor value={value} onChange={onChange} />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[480px] flex-1 resize-none rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5 font-n-mono text-[12px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
      )}
    </div>
  );
}

// ── Internal Crepe wrapper ─────────────────────────────────────────────────

interface CrepeEditorProps {
  value: string;
  onChange(markdown: string): void;
}

/**
 * Thin imperative wrapper around Milkdown Crepe.
 * Mounted once; external value resets trigger a destroy+re-create cycle
 * because Crepe exposes no public `setMarkdown` API.
 */
function CrepeEditor({ value, onChange }: CrepeEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  // Track the last value written to Crepe to avoid infinite update loops.
  const lastSyncedValueRef = useRef<string>(value);

  // Mount Crepe once.
  useEffect(() => {
    if (!rootRef.current) return;

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: value,
    });

    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        lastSyncedValueRef.current = markdown;
        onChange(markdown);
      });
    });

    crepeRef.current = crepe;
    void crepe.create();

    return () => {
      void crepe.destroy().catch(() => { /* ignore on unmount */ });
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value resets (e.g. after a successful save).
  useEffect(() => {
    if (value === lastSyncedValueRef.current) return;
    const crepe = crepeRef.current;
    if (!crepe || !rootRef.current) return;
    lastSyncedValueRef.current = value;
    void crepe.destroy().then(() => {
      if (!rootRef.current) return;
      const next = new Crepe({ root: rootRef.current, defaultValue: value });
      next.on((api) => {
        api.markdownUpdated((_ctx, md) => {
          lastSyncedValueRef.current = md;
          onChange(md);
        });
      });
      crepeRef.current = next;
      void next.create();
    }).catch(() => { /* ignore on unmount race */ });
  }, [value, onChange]);

  return (
    <div
      ref={rootRef}
      className="milkdown-crepe-wrap min-h-[480px] flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas"
    />
  );
}
