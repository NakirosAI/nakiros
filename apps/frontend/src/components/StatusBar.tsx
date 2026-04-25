import { Separator } from './ui';

interface Props {
  /** Current daemon lifecycle phase. Drives the status label on the left. */
  serverStatus: 'starting' | 'running' | 'stopped';
  /** Number of detected project repos in the active workspace. */
  repoCount: number;
  /** Whether the workspace contains a single repo (mono) or several (multi). */
  topology: 'mono' | 'multi';
}

/**
 * Thin footer strip pinned at the bottom of the app window. Shows daemon
 * status on the left and a workspace summary (repo count + topology) on
 * the right. Pure presentational.
 */
export default function StatusBar({
  serverStatus,
  repoCount,
  topology,
}: Props) {
  return (
    <div className="flex h-7 shrink-0 items-center border-t border-[var(--line)] bg-[var(--bg-soft)] px-4 text-[11px]">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <span>{serverStatus === 'running' ? 'Local' : serverStatus === 'starting' ? 'Starting…' : 'Stopped'}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-[var(--text-faint)]">
        <span>{repoCount} {repoCount === 1 ? 'repo' : 'repos'}</span>
        <Separator orientation="vertical" className="h-3" />
        <span>{topology}</span>
      </div>
    </div>
  );
}
