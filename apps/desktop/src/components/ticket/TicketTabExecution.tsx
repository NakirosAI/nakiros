import { useTranslation } from 'react-i18next';
import type { LocalTicket, StoredRepo } from '@nakiros/shared';
import AgentPanel from '../AgentPanel';

interface TicketTabExecutionProps {
  ticket: LocalTicket;
  storedRepos: StoredRepo[];
  workspaceId: string;
  workspacePath: string;
  selectedRepoPath: string;
  formLabelClass: string;
  selectClass: string;
  executionRunning: boolean;
  executionError: string | null;
  executionMessage: string | null;
  executionLaunchKey: number;
  onRepoPathChange(path: string): void;
  onLaunch(): void;
  onDone(): void;
}

export function TicketTabExecution({
  ticket,
  storedRepos,
  workspaceId,
  workspacePath,
  selectedRepoPath,
  formLabelClass,
  selectClass,
  executionRunning,
  executionError,
  executionMessage,
  executionLaunchKey,
  onRepoPathChange,
  onLaunch,
  onDone,
}: TicketTabExecutionProps) {
  const { t } = useTranslation('ticket');

  return (
    <div className="flex min-h-[460px] flex-col gap-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2.5 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-col gap-1">
          <label className={formLabelClass}>{t('workingRepo')}</label>
          <select value={selectedRepoPath} onChange={(event) => onRepoPathChange(event.target.value)} className={selectClass}>
            {storedRepos.map((repo) => (
              <option key={repo.localPath} value={repo.localPath}>
                {repo.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[170px] flex-col gap-1.5">
          <button
            onClick={onLaunch}
            className="rounded-[10px] border-none bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white"
            disabled={storedRepos.length === 0}
          >
            {t('launchDevStory')}
          </button>
          <span className="text-[11px] text-[var(--text-muted)]">
            {executionRunning ? t('runInProgress') : t('lastStatus', { status: ticket.lastRunStatus ?? 'idle' })}
          </span>
        </div>
      </div>
      {executionError && <p className="m-0 text-xs text-[var(--danger)]">{executionError}</p>}
      {executionMessage ? (
        <div className="flex-1 overflow-hidden rounded-[10px] border border-[var(--line)]">
          <AgentPanel
            key={`${ticket.id}-${executionLaunchKey}`}
            workspaceId={workspaceId}
            repos={storedRepos}
            workspacePath={workspacePath}
            initialRepoPath={selectedRepoPath}
            initialMessage={executionMessage}
            onDone={onDone}
          />
        </div>
      ) : executionRunning ? (
        <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-4 text-[13px] text-[var(--text-muted)]">
          {t('launchedInChatIA')}
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] p-4 text-[13px] leading-[1.5] text-[var(--text-muted)]">
          {t('clickToLaunch')} <strong>{t('launchDevStory')}</strong>.
        </div>
      )}
    </div>
  );
}

