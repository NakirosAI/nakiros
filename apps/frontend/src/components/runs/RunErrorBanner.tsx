import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Error message returned by the runner; nothing renders when null/undefined. */
  message: string | null | undefined;
  /** Optional override for the heading; defaults to the shared `runs:error.title`. */
  title?: string;
}

/**
 * Inline banner surfacing a terminal error from a run. Shared across all run
 * kinds (audit / fix / create / eval) so they look identical.
 */
export function RunErrorBanner({ message, title }: Props) {
  const { t } = useTranslation('runs');
  if (!message) return null;
  return (
    <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertTriangle size={12} />
        {title ?? t('error.title')}
      </div>
      <pre className="whitespace-pre-wrap break-all font-mono">{message}</pre>
    </div>
  );
}
