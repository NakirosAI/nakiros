import { useTranslation } from 'react-i18next';

interface TicketTabContextProps {
  contextLoading: boolean;
  contextPreview: string;
  copying: boolean;
  secondaryButtonClass: string;
  onRefresh(): void;
  onCopy(): void;
}

export function TicketTabContext({
  contextLoading,
  contextPreview,
  copying,
  secondaryButtonClass,
  onRefresh,
  onCopy,
}: TicketTabContextProps) {
  const { t } = useTranslation('ticket');

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <button onClick={onRefresh} className={secondaryButtonClass}>
          {contextLoading ? '...' : t('refreshContext')}
        </button>
        <button onClick={onCopy} disabled={copying} className={secondaryButtonClass}>
          {copying ? t('copyingContext') : t('copyContext')}
        </button>
      </div>
      <pre className="m-0 max-h-[460px] overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-3 font-mono text-xs leading-[1.5]">
        {contextLoading ? t('generatingContext') : (contextPreview || t('noContext'))}
      </pre>
    </div>
  );
}

