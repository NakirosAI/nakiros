import { useTranslation } from 'react-i18next';
import { Layers, Plus } from 'lucide-react';
import type { RuleEntry } from '@nakiros/shared';

interface RulesListProps {
  rules: RuleEntry[];
  loading: boolean;
  error: string | null;
  onCreate(): void;
  onOpen(name: string): void;
  onRetry(): void;
}

/**
 * List view of all rules under `.claude/rules/`. Cards show name, scope
 * paths (always-on badge if no `paths:`), token budget, last-edit date and
 * a short summary. Click any card to enter the editor.
 */
export default function RulesList({
  rules,
  loading,
  error,
  onCreate,
  onOpen,
  onRetry,
}: RulesListProps) {
  const { t } = useTranslation('rules');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-n-border-subtle px-7 py-5">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <Layers size={18} className="text-n-accent-strong" />
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
          <Plus size={13} strokeWidth={2.5} /> {t('list.newRule')}
        </button>
      </header>

      <div className="flex-1 overflow-auto px-7 pb-8 pt-5">
        {loading ? (
          <div className="grid place-items-center py-20 text-[13px] text-n-muted">
            {t('list.loading')}
          </div>
        ) : error ? (
          <ErrorPanel message={error} onRetry={onRetry} />
        ) : rules.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rules.map((r) => (
              <RuleCard key={r.relativePath} rule={r} onClick={() => onOpen(stripMd(r.name))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleCard({ rule, onClick }: { rule: RuleEntry; onClick(): void }) {
  const { t } = useTranslation('rules');
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-stretch overflow-hidden rounded-n-lg border border-n-border-subtle bg-n-surface text-left transition-colors hover:border-n-border-default"
    >
      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-n-mono text-[13px] font-semibold text-n-fg" title={rule.name}>
            {rule.name}
          </span>
          <span className="flex-shrink-0 font-n-mono text-[10.5px] text-n-subtle">
            {rule.tokens} tok
          </span>
        </div>
        {rule.summary && (
          <div className="line-clamp-3 text-pretty text-[12px] leading-relaxed text-n-muted">
            {rule.summary}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-n-border-subtle bg-n-canvas px-4 py-2">
        {rule.paths.length === 0 ? (
          <span className="rounded-n-sm bg-n-accent-soft px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.7px] text-n-accent-strong">
            {t('list.alwaysOn')}
          </span>
        ) : (
          rule.paths.slice(0, 3).map((p) => (
            <span
              key={p}
              className="rounded-n-sm border border-n-border-subtle bg-n-surface px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted"
            >
              {p}
            </span>
          ))
        )}
        {rule.paths.length > 3 && (
          <span className="font-n-mono text-[10.5px] text-n-subtle">
            +{rule.paths.length - 3}
          </span>
        )}
        {rule.lastModified && (
          <span className="ml-auto font-n-mono text-[10.5px] text-n-subtle">
            {formatRelative(rule.lastModified)}
          </span>
        )}
      </div>
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  const { t } = useTranslation('rules');
  return (
    <div className="grid place-items-center py-16">
      <div className="max-w-md rounded-n-lg border border-dashed border-n-border-default bg-n-surface px-7 py-8 text-center">
        <Layers size={28} className="mx-auto text-n-subtle" />
        <h3 className="mt-3 text-[14px] font-semibold text-n-fg">{t('list.empty.title')}</h3>
        <p className="mt-1.5 text-pretty text-[12.5px] leading-relaxed text-n-muted">
          {t('list.empty.description')}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80"
        >
          <Plus size={12} strokeWidth={2.5} /> {t('list.newRule')}
        </button>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry(): void }) {
  const { t } = useTranslation('rules');
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

function stripMd(name: string): string {
  return name.endsWith('.md') ? name.slice(0, -3) : name;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h`;
  if (diffSec < 86400 * 30) return `${Math.round(diffSec / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}
