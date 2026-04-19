import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@nakiros/shared';
import appIcon from '../assets/icon.svg';
import { AlertTriangle, Globe, Package, RefreshCw, X } from 'lucide-react';
import VersionIndicator from '../components/VersionIndicator';

interface Props {
  projects: Project[];
  onOpenProject(id: string): void;
  onRescan(): void;
  onDismissProject(id: string): void;
  onOpenNakirosSkills(): void;
  onOpenGlobalSkills(): void;
  bootError?: string;
}

export default function Home({
  projects,
  onOpenProject,
  onRescan,
  onDismissProject,
  onOpenNakirosSkills,
  onOpenGlobalSkills,
  bootError,
}: Props) {
  const { t } = useTranslation('home');
  const [showAll, setShowAll] = useState(false);
  const RECENT_LIMIT = 8;

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

  const sorted = [...projects].sort((a, b) => {
    if (!a.lastActivityAt && !b.lastActivityAt) return 0;
    if (!a.lastActivityAt) return 1;
    if (!b.lastActivityAt) return -1;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  const hasMore = sorted.length > RECENT_LIMIT;
  const displayed = showAll ? sorted : sorted.slice(0, RECENT_LIMIT);
  const inactiveThresholdDays = 30;

  return (
    <div className="box-border flex min-h-screen flex-col items-center justify-center p-6">
      <div className="fixed right-4 top-3 z-10">
        <VersionIndicator variant="inline" />
      </div>
      <div className="w-full max-w-[820px] rounded-[14px] border border-[var(--line)] bg-[var(--bg-soft)] px-7 pb-[26px] pt-[34px] shadow-[var(--shadow-sm)]">
        <div className="mb-7 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={appIcon}
                alt="Logo Nakiros"
                width={44}
                height={44}
                className="block rounded-xl"
              />
              <h1 className="m-0 text-[34px] font-[750] tracking-[-0.02em]">
                Nakiros
              </h1>
            </div>
            <p className="mb-0 mt-2.5 max-w-[520px] text-[15px] text-[var(--text-muted)]">
              {t('subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenNakirosSkills}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
              title={t('nakirosSkills')}
            >
              <Package size={14} />
              {t('nakirosSkills')}
            </button>
            <button
              onClick={onOpenGlobalSkills}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-emerald-400 hover:text-emerald-400"
              title={t('globalSkillsTooltip')}
            >
              <Globe size={14} />
              {t('globalSkills')}
            </button>
            <button
              onClick={onRescan}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <RefreshCw size={14} />
              {t('rescan')}
            </button>
          </div>
        </div>

        {bootError && (
          <div className="mb-4 rounded-[10px] border border-[#f1b5b5] bg-[#fff3f3] px-3 py-2.5 text-[13px] text-[#8b1f1f]">
            {bootError}
          </div>
        )}

        {sorted.length > 0 ? (
          <div>
            <p className="mb-3 mt-0 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t('projects')} ({sorted.length})
            </p>
            <div className="flex flex-col gap-2">
              {displayed.map((project) => {
                const isInactive = project.lastActivityAt
                  ? (Date.now() - new Date(project.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24) > inactiveThresholdDays
                  : false;

                return (
                  <div
                    key={project.id}
                    className="group box-border flex w-full items-center justify-between rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-3.5 py-3"
                  >
                    <button
                      onClick={() => onOpenProject(project.id)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 border-none bg-transparent p-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{project.name}</span>
                        <span className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                          {project.provider}
                        </span>
                        {isInactive && (
                          <AlertTriangle size={12} className="text-amber-400" />
                        )}
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {project.sessionCount} sessions · {project.skillCount} skills
                        {project.lastActivityAt && ` · ${timeAgo(project.lastActivityAt)}`}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismissProject(project.id);
                      }}
                      title={t('dismiss')}
                      className="ml-2 rounded p-1 text-[var(--text-muted)] opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <button
                onClick={() => setShowAll((prev) => !prev)}
                className="mt-2.5 border-none bg-transparent px-0.5 py-1 text-[13px] text-[var(--text-muted)]"
              >
                {showAll
                  ? t('showLess')
                  : t('showMore', { count: sorted.length - RECENT_LIMIT })}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
            {t('noProjects')}
          </div>
        )}
      </div>
    </div>
  );
}
