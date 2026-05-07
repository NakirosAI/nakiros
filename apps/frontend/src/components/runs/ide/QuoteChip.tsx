import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuoteSelection } from './types';

interface QuoteChipProps {
  quote: QuoteSelection;
  onRemove(quote: QuoteSelection): void;
}

/**
 * Renders a single quoted-code chip above the IDE chat composer.
 *
 * Shows the file path + line range as a pill.  An × button removes the
 * chip without clearing the rest of the composer state.
 */
export default function QuoteChip({ quote, onRemove }: QuoteChipProps) {
  const { t } = useTranslation('runs');
  const lineRange =
    quote.startLine === quote.endLine
      ? `L${quote.startLine}`
      : `L${quote.startLine}–${quote.endLine}`;

  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-n-sm border border-n-border-subtle bg-n-sunken px-2 py-1 font-n-mono text-[11px] text-n-fg">
      {/* File path — truncated on overflow */}
      <span className="min-w-0 truncate text-n-muted" title={quote.filePath}>
        {quote.filePath}
      </span>
      {/* Line range */}
      <span className="shrink-0 text-n-accent">{lineRange}</span>
      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(quote)}
        aria-label={t('ide.removeQuote', { defaultValue: 'Remove quote' })}
        className="ml-0.5 shrink-0 rounded-sm text-n-muted transition-colors hover:text-n-critical focus:outline-none focus-visible:ring-1 focus-visible:ring-n-accent"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </div>
  );
}
