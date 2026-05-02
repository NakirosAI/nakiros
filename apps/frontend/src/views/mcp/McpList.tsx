import { useTranslation } from 'react-i18next';
import { Plug, Plus } from 'lucide-react';
import type { McpServerEntry } from '@nakiros/shared';

interface McpListProps {
  items: McpServerEntry[];
  loading: boolean;
  error: string | null;
  parseError: string | undefined;
  fileExists: boolean;
  filePath: string;
  onCreate(): void;
  onOpen(name: string): void;
  onRetry(): void;
}

/** List view of `.mcp.json` servers. Cards summarize transport + command /
 *  url + env keys; click a card to enter the editor. */
export default function McpList({
  items,
  loading,
  error,
  parseError,
  fileExists,
  filePath,
  onCreate,
  onOpen,
  onRetry,
}: McpListProps) {
  const { t } = useTranslation('mcp');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-n-border-subtle px-7 py-5">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <Plug size={18} className="text-n-accent-strong" />
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
          <Plus size={13} strokeWidth={2.5} /> {t('list.newServer')}
        </button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n-border-subtle bg-n-canvas px-7 py-2.5">
        <span className="break-all font-n-mono text-[11px] text-n-subtle" title={filePath}>
          {filePath || '.mcp.json'}
        </span>
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
          {fileExists ? t('list.fileExists') : t('list.fileMissing')}
        </span>
      </div>

      <div className="flex-1 overflow-auto px-7 pb-8 pt-5">
        {loading ? (
          <div className="grid place-items-center py-20 text-[13px] text-n-muted">
            {t('list.loading')}
          </div>
        ) : error ? (
          <ErrorPanel message={error} onRetry={onRetry} />
        ) : parseError ? (
          <div className="rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2.5">
            <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-[oklch(0.55_0.16_25)]">
              {t('list.parseErrorTitle')}
            </div>
            <div className="mt-0.5 break-all font-n-mono text-[11.5px] text-n-fg">{parseError}</div>
          </div>
        ) : items.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((s) => (
              <ServerCard key={s.name} server={s} onClick={() => onOpen(s.name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerCard({ server, onClick }: { server: McpServerEntry; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-stretch overflow-hidden rounded-n-lg border border-n-border-subtle bg-n-surface text-left transition-colors hover:border-n-border-default"
    >
      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-n-mono text-[13px] font-semibold text-n-fg" title={server.name}>
            {server.name}
          </span>
          {server.transport && (
            <span className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted">
              {server.transport}
            </span>
          )}
        </div>
        {server.command && (
          <div className="break-all font-n-mono text-[11.5px] text-n-muted">
            $ {server.command}
            {server.args.length > 0 ? ' ' + server.args.join(' ') : ''}
          </div>
        )}
        {server.url && (
          <div className="break-all font-n-mono text-[11.5px] text-n-muted">{server.url}</div>
        )}
      </div>
      {server.envKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-n-border-subtle bg-n-canvas px-4 py-2">
          <span className="font-n-mono text-[10.5px] uppercase tracking-[0.7px] text-n-subtle">
            env
          </span>
          {server.envKeys.map((k) => (
            <span
              key={k}
              className="rounded-n-sm border border-n-border-subtle bg-n-surface px-1.5 py-0.5 font-n-mono text-[10.5px] text-n-muted"
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  const { t } = useTranslation('mcp');
  return (
    <div className="grid place-items-center py-12">
      <div className="max-w-md rounded-n-lg border border-dashed border-n-border-default bg-n-surface px-7 py-8 text-center">
        <Plug size={28} className="mx-auto text-n-subtle" />
        <h3 className="mt-3 text-[14px] font-semibold text-n-fg">{t('list.empty.title')}</h3>
        <p className="mt-1.5 text-pretty text-[12.5px] leading-relaxed text-n-muted">
          {t('list.empty.description')}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80"
        >
          <Plus size={12} strokeWidth={2.5} /> {t('list.newServer')}
        </button>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry(): void }) {
  const { t } = useTranslation('mcp');
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
