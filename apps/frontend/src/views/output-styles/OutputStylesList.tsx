import { useTranslation } from 'react-i18next';
import { Plus, Sliders } from 'lucide-react';
import type { OutputStyleEntry } from '@nakiros/shared';

const BUILT_IN_STYLES = new Set(['Default', 'Explanatory', 'Learning']);

interface OutputStylesListProps {
  styles: OutputStyleEntry[];
  activeName: string | null;
  activeSource: 'project' | 'local' | 'none';
  loading: boolean;
  error: string | null;
  onCreate(): void;
  onOpen(name: string): void;
  onRetry(): void;
}

/**
 * List view of `.claude/output-styles/`. Built-in styles (Default,
 * Explanatory, Learning) aren't on disk so they don't appear as cards.
 * Instead, when one of them is the active selection, it's shown in a
 * banner above the list. The active style — built-in OR custom — gets
 * an "active" badge on its card or banner.
 */
export default function OutputStylesList({
  styles,
  activeName,
  activeSource,
  loading,
  error,
  onCreate,
  onOpen,
  onRetry,
}: OutputStylesListProps) {
  const { t } = useTranslation('output-styles');
  const builtInActive = activeName !== null && BUILT_IN_STYLES.has(activeName);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-n-border-subtle px-7 py-5">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <Sliders size={18} className="text-n-accent-strong" />
            {t('list.title')}
          </h1>
          <p className="m-0 mt-1 max-w-2xl text-pretty text-[13px] leading-relaxed text-n-muted">
            {t('list.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12px] text-n-accent-strong hover:bg-n-accent-soft/80"
        >
          <Plus size={13} strokeWidth={2.5} /> {t('list.newStyle')}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-7 pb-8 pt-5">
        {loading ? (
          <div className="grid place-items-center py-20 text-[13px] text-n-muted">
            {t('list.loading')}
          </div>
        ) : error ? (
          <ErrorPanel message={error} onRetry={onRetry} />
        ) : (
          <>
            {/* Active banner */}
            {activeName && (
              <ActiveBanner
                activeName={activeName}
                activeSource={activeSource}
                isBuiltIn={builtInActive}
              />
            )}

            {!activeName && (
              <NoActiveBanner />
            )}

            {styles.length === 0 ? (
              <EmptyState onCreate={onCreate} />
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {styles.map((s) => (
                  <StyleCard
                    key={s.relativePath}
                    style={s}
                    isActive={s.name === activeName}
                    onClick={() => onOpen(s.name)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActiveBanner({
  activeName,
  activeSource,
  isBuiltIn,
}: {
  activeName: string;
  activeSource: 'project' | 'local' | 'none';
  isBuiltIn: boolean;
}) {
  const { t } = useTranslation('output-styles');
  return (
    <div className="rounded-n-md border border-n-accent-line bg-n-accent-soft/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-accent-strong">
            {t('list.activeBadge')}
          </span>
          <span className="font-n-mono text-[13px] font-semibold text-n-fg">{activeName}</span>
          {isBuiltIn && (
            <span className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.7px] text-n-muted">
              {t('list.builtIn')}
            </span>
          )}
        </div>
        <span className="font-n-mono text-[10.5px] text-n-subtle">
          {t('list.source', { source: activeSource })}
        </span>
      </div>
      {isBuiltIn && (
        <p className="m-0 mt-1.5 text-pretty text-[11.5px] leading-relaxed text-n-muted">
          {t('list.builtInHelp')}
        </p>
      )}
    </div>
  );
}

function NoActiveBanner() {
  const { t } = useTranslation('output-styles');
  return (
    <div className="rounded-n-md border border-dashed border-n-border-default bg-n-canvas px-4 py-3">
      <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {t('list.noActive')}
      </div>
      <p className="m-0 mt-1 text-pretty text-[12px] leading-relaxed text-n-muted">
        {t('list.noActiveHelp')}
      </p>
    </div>
  );
}

function StyleCard({
  style,
  isActive,
  onClick,
}: {
  style: OutputStyleEntry;
  isActive: boolean;
  onClick(): void;
}) {
  const { t } = useTranslation('output-styles');
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col items-stretch overflow-hidden rounded-n-lg border bg-n-surface text-left transition-colors hover:border-n-border-default ' +
        (isActive ? 'border-n-accent-line' : 'border-n-border-subtle')
      }
    >
      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-n-mono text-[13px] font-semibold text-n-fg" title={style.name}>
            {style.name}
          </span>
          {isActive && (
            <span className="rounded-n-sm bg-n-accent-soft px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.7px] text-n-accent-strong">
              {t('list.activeBadge')}
            </span>
          )}
        </div>
        {style.description && (
          <div className="line-clamp-3 text-pretty text-[12px] leading-relaxed text-n-muted">
            {style.description}
          </div>
        )}
      </div>
      {style.keepCodingInstructions && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-n-border-subtle bg-n-canvas px-4 py-2">
          <span className="rounded-n-sm border border-n-border-subtle bg-n-surface px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted">
            {t('list.keepCoding')}
          </span>
        </div>
      )}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  const { t } = useTranslation('output-styles');
  return (
    <div className="grid place-items-center py-12">
      <div className="max-w-md rounded-n-lg border border-dashed border-n-border-default bg-n-surface px-7 py-8 text-center">
        <Sliders size={28} className="mx-auto text-n-subtle" />
        <h3 className="mt-3 text-[14px] font-semibold text-n-fg">{t('list.empty.title')}</h3>
        <p className="mt-1.5 text-pretty text-[12.5px] leading-relaxed text-n-muted">
          {t('list.empty.description')}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80"
        >
          <Plus size={12} strokeWidth={2.5} /> {t('list.newStyle')}
        </button>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry(): void }) {
  const { t } = useTranslation('output-styles');
  return (
    <div className="grid place-items-center py-16">
      <div className="max-w-md rounded-n-lg border border-n-border-default bg-n-surface px-7 py-7 text-center">
        <h3 className="text-[14px] font-semibold text-n-fg">{t('list.error.title')}</h3>
        <p className="mt-1 break-all font-n-mono text-[11.5px] text-n-muted">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
        >
          {t('list.error.retry')}
        </button>
      </div>
    </div>
  );
}
