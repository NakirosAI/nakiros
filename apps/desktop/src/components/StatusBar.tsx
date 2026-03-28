import { useEffect, useState } from 'react';
import { AlertCircle, Check, Cloud, RefreshCw, User, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import type { AuthState } from '@nakiros/shared';
import { Separator } from './ui';
import type { WorkspaceSyncState } from '../views/Dashboard';

interface ColleagueUpdate {
  name: string;
  file: string;
}

interface Props {
  authState: AuthState;
  serverStatus: 'starting' | 'running' | 'stopped';
  workspaceSyncState: WorkspaceSyncState;
  repoCount: number;
  topology: 'mono' | 'multi';
  onRetrySync?(): void;
  /** Injected externally when a colleague's update is received */
  colleagueUpdate?: ColleagueUpdate | null;
}

export default function StatusBar({
  authState,
  serverStatus,
  workspaceSyncState,
  repoCount,
  topology,
  onRetrySync,
  colleagueUpdate,
}: Props) {
  const [visibleColleague, setVisibleColleague] = useState<ColleagueUpdate | null>(null);

  useEffect(() => {
    if (!colleagueUpdate) return;
    setVisibleColleague(colleagueUpdate);
    const timer = window.setTimeout(() => setVisibleColleague(null), 5000);
    return () => window.clearTimeout(timer);
  }, [colleagueUpdate]);

  const isOnline = authState.isAuthenticated;
  const { syncing, error } = workspaceSyncState;
  const isServerStarting = serverStatus === 'starting';

  const connectionSection = (() => {
    if (!isOnline) {
      return (
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <WifiOff size={11} />
          <span>Offline · changes queued locally</span>
        </div>
      );
    }
    if (isServerStarting) {
      return (
        <div className="flex items-center gap-1.5 text-[var(--warning)]">
          <Cloud size={11} className="animate-pulse" />
          <span>Reconnecting…</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-[var(--success)]">
        <Cloud size={11} />
        <span>Connected</span>
      </div>
    );
  })();

  const syncSection = (() => {
    if (error) {
      return (
        <button
          onClick={onRetrySync}
          className="flex items-center gap-1.5 text-[var(--danger)] hover:text-[var(--danger)]"
        >
          <AlertCircle size={11} />
          <span>Sync error · click to retry</span>
        </button>
      );
    }
    if (syncing) {
      return (
        <div className="flex items-center gap-1.5 text-[var(--teal,#14b8a6)]">
          <RefreshCw size={11} className="animate-spin" />
          <span>Syncing…</span>
        </div>
      );
    }
    if (isOnline) {
      return (
        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <Check size={11} />
          <span>Synced</span>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-[var(--line)] bg-[var(--bg-soft)] px-4 text-[11px]">
      {connectionSection}

      {syncSection && (
        <>
          <Separator orientation="vertical" className="mx-2.5 h-3" />
          {syncSection}
        </>
      )}

      {visibleColleague && (
        <>
          <Separator orientation="vertical" className="mx-2.5 h-3" />
          <div className="flex items-center gap-1.5 text-[#a78bfa]">
            <User size={11} />
            <span>
              {visibleColleague.name} updated {visibleColleague.file}
            </span>
          </div>
        </>
      )}

      <div className="flex-1" />

      <div
        className={clsx(
          'flex items-center gap-2 text-[var(--text-faint)]',
        )}
      >
        <span>{repoCount} {repoCount === 1 ? 'repo' : 'repos'}</span>
        <Separator orientation="vertical" className="h-3" />
        <span>{topology}</span>
      </div>
    </div>
  );
}
