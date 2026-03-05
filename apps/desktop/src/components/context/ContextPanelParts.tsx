import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { getDaysAgo, freshnessLabel } from '../../utils/dates';

export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-[14px] pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
      {label}
    </div>
  );
}

export function DocRow({
  doc,
  isSelected,
  onSelect,
  onRegenerate,
  indent,
}: {
  doc: ScannedDoc;
  isSelected: boolean;
  onSelect(): void;
  onRegenerate?(): void;
  indent?: boolean;
}) {
  const { t } = useTranslation('context');
  const days = getDaysAgo(doc.lastModifiedAt);
  const label = days !== null ? freshnessLabel(days, doc.isGenerated, t) : null;

  return (
    <div
      className={clsx(
        'flex items-center gap-1',
        indent ? 'px-2 pb-[3px] pl-7 pt-[3px]' : 'px-2 pb-[3px] pl-[14px] pt-[3px]',
        isSelected ? 'bg-[var(--bg-muted)]' : 'bg-transparent',
      )}
    >
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start gap-px border-none bg-transparent px-0 py-px text-left text-[var(--text)]"
      >
        <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs">{doc.name}</span>
        {label && days !== null && <span className={clsx('text-[10px]', freshnessTextClass(days))}>{label}</span>}
      </button>
      {doc.isGenerated && onRegenerate && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onRegenerate();
          }}
          title={t('regenerate')}
          className="shrink-0 border-none bg-transparent px-[3px] py-0.5 text-[13px] leading-none text-[var(--text-muted)]"
        >
          ↻
        </button>
      )}
    </div>
  );
}

export function MissingDocRow({
  name,
  onGenerate,
  indent,
}: {
  name: string;
  onGenerate(): void;
  indent?: boolean;
}) {
  const { t } = useTranslation('context');

  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-1.5',
        indent ? 'px-2 pb-[3px] pl-7 pt-[3px]' : 'px-2 pb-[3px] pl-[14px] pt-[3px]',
      )}
    >
      <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs italic text-[var(--text-muted)]">{name}</span>
      <div className="flex shrink-0 items-center gap-[5px]">
        <span className="whitespace-nowrap text-[10px] italic text-[var(--text-muted)]">{t('notGenerated')}</span>
        <button
          onClick={onGenerate}
          className="whitespace-nowrap rounded border border-[var(--line)] bg-transparent px-[5px] py-px text-[10px] text-[var(--text-muted)]"
        >
          {t('generateArrow')}
        </button>
      </div>
    </div>
  );
}

export function EmptyGlobalSection({ onGenerate }: { onGenerate(): void }) {
  const { t } = useTranslation('context');

  return (
    <div className="px-[14px] pb-2 pt-1">
      <p className="mb-1.5 mt-0 text-[11px] italic text-[var(--text-muted)]">{t('noGlobalContext')}</p>
      <button
        onClick={onGenerate}
        className="rounded-md border border-[var(--line)] bg-[var(--bg-soft)] px-2 py-[3px] text-[11px] text-[var(--text-muted)]"
      >
        {t('generateGlobalContext')}
      </button>
    </div>
  );
}

export function FreshnessBanner({
  doc,
  onRegenerate,
}: {
  doc: ScannedDoc;
  onRegenerate(): void;
}) {
  const { t } = useTranslation('context');
  const days = getDaysAgo(doc.lastModifiedAt);
  if (days === null) return null;

  const isStale = days >= 7;
  const label = isStale
    ? t('freshnessStale', { count: days })
    : t('freshnessGenerated', { count: days });

  return (
    <div
      className={clsx(
        'mb-[14px] flex items-center justify-between gap-2 rounded-lg border px-[10px] py-1.5 text-[11px]',
        isStale
          ? 'border-[#f59e0b] bg-[rgba(245,158,11,0.08)] text-[#ef4444]'
          : 'border-[var(--line)] bg-[var(--bg-soft)]',
        !isStale && freshnessTextClass(days),
      )}
    >
      <span>{label}</span>
      <button
        onClick={onRegenerate}
        className="shrink-0 border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--primary)]"
      >
        {t('regenerateArrow')}
      </button>
    </div>
  );
}

export function ActionButton({
  label,
  description,
  onClick,
  recommended,
  badge,
}: {
  label: string;
  description: string;
  onClick(): void;
  recommended?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full cursor-pointer flex-col gap-0.5 rounded-[10px] px-2 py-[7px] text-left',
        recommended
          ? 'border border-[var(--primary)] bg-[var(--primary-soft)]'
          : 'border border-[var(--line)] bg-[var(--bg-soft)]',
      )}
    >
      <span className={clsx('text-xs font-bold', recommended ? 'text-[var(--primary)]' : 'text-[var(--text)]')}>
        {label}
        {badge && (
          <span className="ml-1.5 rounded-[10px] border border-[#f59e0b] bg-[#fef3c7] px-1 py-px align-middle text-[10px] font-bold text-[#92400e]">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[10px] text-[var(--text-muted)]">{description}</span>
    </button>
  );
}

export function EmptyPanel({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
      {icon}
      <span className="text-[13px]">{title}</span>
      {subtitle && <span className="text-[11px]">{subtitle}</span>}
    </div>
  );
}

function freshnessTextClass(days: number): string {
  if (days < 3) return 'text-[var(--text-muted)]';
  if (days < 7) return 'text-[#f59e0b]';
  return 'text-[#ef4444]';
}

