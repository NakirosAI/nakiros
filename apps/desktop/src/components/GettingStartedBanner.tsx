import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  onComplete(): void;
  onDismiss(): void;
}

export default function GettingStartedBanner({ onComplete, onDismiss }: Props) {
  const { t } = useTranslation('overview');

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--primary)] bg-[var(--primary-soft)] px-[18px] py-2 text-[13px]">
      <button
        onClick={onComplete}
        className="flex-1 text-left font-semibold text-[var(--primary)] hover:underline"
      >
        {t('setupBannerMessage')}
      </button>
      <button
        onClick={onDismiss}
        aria-label={t('setupBannerDismiss')}
        className="grid h-6 w-6 place-items-center rounded-md border-none bg-transparent text-[var(--primary)] opacity-70 hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
