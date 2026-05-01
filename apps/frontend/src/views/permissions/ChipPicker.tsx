import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';

interface ChipPickerProps {
  values: string[];
  /** Suggestions shown only when no matching value is already in `values`. */
  suggestions?: string[];
  placeholder: string;
  /** Tone of the chips (different colors for allow / deny / ask). */
  tone: 'positive' | 'negative' | 'warn';
  onChange(next: string[]): void;
}

/**
 * Tag-style editor for `permissions.{allow,deny,ask}` lists. Each entry is
 * a removable chip; an input adds new entries (Enter or click). The
 * `tone` prop drives the chip's accent color so allow / deny / ask are
 * visually distinct.
 */
export default function ChipPicker({
  values,
  suggestions = [],
  placeholder,
  tone,
  onChange,
}: ChipPickerProps) {
  const { t } = useTranslation('permissions');
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const canAdd = trimmed.length > 0 && !values.includes(trimmed);
  const remainingSuggestions = suggestions.filter((s) => !values.includes(s));

  const add = () => {
    if (!canAdd) return;
    onChange([...values, trimmed]);
    setDraft('');
  };

  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const chipClass =
    tone === 'positive'
      ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
      : tone === 'negative'
        ? 'border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] text-[oklch(0.50_0.16_25)]'
        : 'border-[oklch(0.78_0.14_85_/_0.5)] bg-[oklch(0.92_0.10_85_/_0.18)] text-[oklch(0.50_0.13_85)]';

  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className={
                'inline-flex items-center gap-1 rounded-n-sm border px-1.5 py-0.5 font-n-mono text-[11px] ' +
                chipClass
              }
            >
              <span className="break-all">{v}</span>
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={t('editor.removeEntry', { value: v })}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
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
          placeholder={placeholder}
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
              onClick={() => onChange([...values, s])}
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
