import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';

interface PathPickerProps {
  paths: string[];
  onChange(next: string[]): void;
}

const SUGGESTIONS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.md',
  'src/**',
  'src/api/**',
  'src/components/**',
];

/**
 * Tag-style editor for the rule's `paths:` frontmatter. Each glob is a
 * removable chip; an input adds new globs (Enter or click). A row of common
 * suggestions is shown only when the relevant ones are not already in the
 * list. An empty list = always-on rule (loaded at session start).
 */
export default function PathPicker({ paths, onChange }: PathPickerProps) {
  const { t } = useTranslation('rules');
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const canAdd = trimmed.length > 0 && !paths.includes(trimmed);
  const remainingSuggestions = SUGGESTIONS.filter((s) => !paths.includes(s));

  const add = () => {
    if (!canAdd) return;
    onChange([...paths, trimmed]);
    setDraft('');
  };

  const remove = (p: string) => onChange(paths.filter((x) => x !== p));

  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {paths.length === 0 ? (
          <span className="font-n-mono text-[11.5px] italic text-n-subtle">
            {t('editor.alwaysOn')}
          </span>
        ) : (
          paths.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-1.5 py-0.5 font-n-mono text-[11px] text-n-accent-strong"
            >
              <span className="break-all">{p}</span>
              <button
                type="button"
                onClick={() => remove(p)}
                aria-label={t('editor.removePath', { path: p })}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-n-accent-line/40"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('editor.pathPlaceholder')}
          className="flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11px] text-n-muted hover:bg-n-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={11} strokeWidth={2.5} /> {t('editor.add')}
        </button>
      </div>
      {remainingSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editor.suggestions')}
          </span>
          {remainingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...paths, s])}
              className="rounded-n-sm border border-dashed border-n-border-default bg-transparent px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted hover:bg-n-surface"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
