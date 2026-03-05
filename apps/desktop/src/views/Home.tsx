import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredWorkspace } from '@nakiros/shared';
import appIcon from '../assets/icon.svg';
import { SquarePlus } from 'lucide-react';

const RECENT_LIMIT = 5;

interface Props {
  recentWorkspaces: StoredWorkspace[];
  onNewWorkspace(): void;
  onOpenWorkspace(id: string): void;
  bootError?: string;
}

export default function Home({
  recentWorkspaces,
  onNewWorkspace,
  onOpenWorkspace,
  bootError,
}: Props) {
  const { t } = useTranslation('home');
  const [showAll, setShowAll] = useState(false);

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('now');
    if (mins < 60) return t('minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('daysAgo', { count: days });
  }

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        onNewWorkspace();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onNewWorkspace]);

  const hasMore = recentWorkspaces.length > RECENT_LIMIT;
  const displayed = showAll ? recentWorkspaces : recentWorkspaces.slice(0, RECENT_LIMIT);

  return (
    <div className="box-border flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-[820px] rounded-[14px] border border-[var(--line)] bg-[var(--bg-soft)] px-7 pb-[26px] pt-[34px] shadow-[var(--shadow-sm)]">
        <div className="mb-7 text-left">
          <div className="flex items-center gap-3">
            <img
              src={appIcon}
              alt="Logo Nakiros"
              width={44}
              height={44}
              className="block rounded-xl"
            />
            <h1 className="m-0 text-[34px] font-[750] tracking-[-0.02em]">
              {t('title')}
            </h1>
          </div>
          <p className="mb-0 mt-2.5 max-w-[520px] text-[15px] text-[var(--text-muted)]">
            {t('subtitle')}
          </p>
        </div>

        {bootError && (
          <div className="mb-4 rounded-[10px] border border-[#f1b5b5] bg-[#fff3f3] px-3 py-2.5 text-[13px] text-[#8b1f1f]">
            {bootError}
          </div>
        )}

        <div className="mb-7">
          <button
            onClick={onNewWorkspace}
            className="w-[236px] rounded-xl border-[1.5px] border-[var(--primary)] bg-[var(--primary-soft)] px-[18px] pb-[18px] pt-[22px] text-left"
          >
            <span className="mb-2.5 block text-[var(--primary)]">
              <SquarePlus size={32} />
            </span>
            <strong className="mb-1.5 block text-base">
              {t('createWorkspace')}
            </strong>
            <span className="text-[13px] text-[var(--text-muted)]">
              {t('createWorkspaceHint')}
            </span>
            <span className="ml-[5px] mt-3 inline-block rounded-[10px] border border-[var(--line-strong)] px-2 py-[3px] text-[11px] font-semibold text-[var(--text-muted)]">
              Ctrl/Cmd + N
            </span>
          </button>
        </div>

        {recentWorkspaces.length > 0 ? (
          <div>
            <p className="mb-3 mt-0 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t('recent')}
            </p>
            <div className="flex flex-col gap-2">
              {displayed.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => onOpenWorkspace(ws.id)}
                  className="box-border flex w-full items-center justify-between rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3.5 py-3 text-left"
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-sm font-bold">{ws.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {t('repoCount', { count: ws.repos.length })}
                      {ws.pmTool ? ` · ${ws.pmTool}${ws.projectKey ? ` ${ws.projectKey}` : ''}` : ''}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">
                    {timeAgo(ws.lastOpenedAt)}
                  </span>
                </button>
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => setShowAll((prev) => !prev)}
                className="mt-2.5 border-none bg-transparent px-0.5 py-1 text-[13px] text-[var(--text-muted)]"
              >
                {showAll ? t('showLess') : t('showMore', { count: recentWorkspaces.length - RECENT_LIMIT })}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
            {t('noRecent')}
          </div>
        )}
      </div>
    </div>
  );
}
