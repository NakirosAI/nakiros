import { useMemo } from 'react';
import { diffLines } from 'diff';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Button } from '../ui';

interface Props {
  baseline: string;
  proposed: string;
  onAccept(): void;
  onReject(): void;
}

export default function DiffView({ baseline, proposed, onAccept, onReject }: Props) {
  const { t } = useTranslation('context');
  const chunks = useMemo(() => diffLines(baseline, proposed), [baseline, proposed]);
  const addedCount = chunks.filter((chunk) => chunk.added).length;
  const removedCount = chunks.filter((chunk) => chunk.removed).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t('docEditorDiffTitle')}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {t('artifactReviewDiffSummary', { added: addedCount, removed: removedCount })}
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={onAccept}>
            {t('docEditorAcceptAll')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReject}>
            {t('docEditorReject')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-5">
        {chunks.map((chunk, i) => (
          <pre
            key={i}
            className={clsx(
              'my-0 whitespace-pre-wrap break-words',
              chunk.added && 'bg-[rgba(34,197,94,0.12)] text-[#15803d]',
              chunk.removed && 'bg-[rgba(239,68,68,0.1)] text-[#b91c1c] line-through opacity-70',
              !chunk.added && !chunk.removed && 'text-[var(--text)]',
            )}
          >
            {chunk.value}
          </pre>
        ))}
      </div>
    </div>
  );
}
