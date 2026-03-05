import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  AgentProvider,
  LocalEpic,
  LocalTicket,
  StoredRepo,
  StoredWorkspace,
  TicketPriority,
  TicketStatus,
} from '@nakiros/shared';
import {
  TicketTabArtifacts,
  TicketTabContext,
  TicketTabDefinition,
  TicketTabExecution,
} from './ticket';

type TicketHubTab = 'definition' | 'context' | 'execution' | 'artifacts';

interface Props {
  ticket: LocalTicket;
  allTickets: LocalTicket[];
  epics: LocalEpic[];
  repos: string[];
  storedRepos: StoredRepo[];
  workspaceId: string;
  workspace: StoredWorkspace;
  onUpdate(ticket: LocalTicket): void;
  onClose(): void;
  onContextCopy(): void;
  copying: boolean;
  defaultProvider: AgentProvider;
}

export default function TicketDetail({
  ticket,
  allTickets,
  epics,
  repos,
  storedRepos,
  workspaceId,
  workspace,
  onUpdate,
  onClose,
  onContextCopy,
  copying,
  defaultProvider,
}: Props) {
  const { t: tt, i18n } = useTranslation('ticket');
  const locale = i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';

  const [currentTicket, setCurrentTicket] = useState(ticket);
  const [activeTab, setActiveTab] = useState<TicketHubTab>('definition');
  const [contextPreview, setContextPreview] = useState<string>('');
  const [contextLoading, setContextLoading] = useState(false);
  const [executionLaunchKey, setExecutionLaunchKey] = useState(0);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [executionRepoPath, setExecutionRepoPath] = useState<string>('');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionRunning, setExecutionRunning] = useState(false);

  const repoMap = useMemo(
    () => new Map(storedRepos.map((repo) => [repo.name, repo])),
    [storedRepos],
  );

  const selectedRepoPath =
    executionRepoPath
    || repoMap.get(currentTicket.repoName ?? '')?.localPath
    || storedRepos[0]?.localPath
    || '';

  const statusLabels: Record<TicketStatus, string> = {
    backlog: tt('statusBacklog'),
    todo: tt('statusTodo'),
    in_progress: tt('statusInProgress'),
    done: tt('statusDone'),
  };

  const priorityLabels: Record<TicketPriority, string> = {
    low: tt('priorityLow'),
    medium: tt('priorityMedium'),
    high: tt('priorityHigh'),
  };

  useEffect(() => setCurrentTicket(ticket), [ticket]);

  useEffect(() => {
    setExecutionRepoPath(repoMap.get(ticket.repoName ?? '')?.localPath ?? storedRepos[0]?.localPath ?? '');
  }, [ticket.id, ticket.repoName, storedRepos, repoMap]);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onClose]);

  useEffect(() => {
    if (activeTab !== 'context') return;
    setContextLoading(true);
    void window.nakiros
      .generateContext(workspaceId, currentTicket.id, workspace)
      .then(setContextPreview)
      .catch(() => setContextPreview(tt('unableToGenerateContext')))
      .finally(() => setContextLoading(false));
  }, [activeTab, currentTicket.id, tt, workspace, workspaceId]);

  async function save(updated: LocalTicket) {
    const next = { ...updated, updatedAt: new Date().toISOString() };
    setCurrentTicket(next);
    await window.nakiros.saveTicket(workspaceId, next);
    onUpdate(next);
  }

  function field<K extends keyof LocalTicket>(key: K, value: LocalTicket[K]) {
    void save({ ...currentTicket, [key]: value });
  }

  async function refreshContext() {
    setContextLoading(true);
    try {
      const generated = await window.nakiros.generateContext(workspaceId, currentTicket.id, workspace);
      setContextPreview(generated);
    } catch {
      setContextPreview(tt('unableToGenerateContext'));
    } finally {
      setContextLoading(false);
    }
  }

  async function launchDevStory() {
    if (!selectedRepoPath) {
      setExecutionError(tt('selectRepo'));
      return;
    }
    setExecutionError(null);
    setExecutionRunning(true);
    const command = '/nak-workflow-dev-story';
    const nextMessage = [
      command,
      '',
      `${tt('commandTicketLabel')}: ${currentTicket.id}`,
      `${tt('commandTitleLabel')}: ${currentTicket.title}`,
      `${tt('commandPriorityLabel')}: ${currentTicket.priority}`,
      `${tt('acceptanceCriteria')}:`,
      ...(currentTicket.acceptanceCriteria.length > 0
        ? currentTicket.acceptanceCriteria.map((criteria) => `- ${criteria || tt('toComplete')}`)
        : [`- ${tt('toComplete')}`]),
    ].join('\n');

    setExecutionMessage(nextMessage);
    setExecutionLaunchKey((prev) => prev + 1);

    await save({
      ...currentTicket,
      lastRunAt: new Date().toISOString(),
      lastRunStatus: 'running',
      lastRunProvider: defaultProvider,
      lastRunCommand: command,
    });
  }

  function handleExecutionDone() {
    setExecutionRunning(false);
    void save({
      ...currentTicket,
      lastRunStatus: 'success',
      lastRunAt: new Date().toISOString(),
      lastRunProvider: defaultProvider,
      lastRunCommand: currentTicket.lastRunCommand ?? '/nak-workflow-dev-story',
    });
  }

  const targetRepo = storedRepos.find((repo) => repo.localPath === selectedRepoPath);

  const formLabelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]';
  const sectionCardClass = 'rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-[11px]';
  const inputClass = 'ui-form-control w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-[11px] py-[9px] text-[13px] text-[var(--text)]';
  const selectClass = 'ui-form-control cursor-pointer rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-[9px] py-[7px] text-xs text-[var(--text)]';
  const secondaryButtonClass = 'rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-[11px] py-[7px] text-xs font-semibold text-[var(--text)]';

  return (
    <div className="flex h-full w-[560px] shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-[var(--bg-soft)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-[18px] py-[14px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-xs text-[var(--text-muted)]">{currentTicket.id}</span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-bold">{currentTicket.title}</span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
              {statusLabels[currentTicket.status]}
            </span>
            <span className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-muted)]">
              {priorityLabels[currentTicket.priority]}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="border-none bg-transparent text-base text-[var(--text-muted)]">✕</button>
      </div>

      <div className="flex gap-0.5 border-b border-[var(--line)] bg-[var(--bg-card)] px-[10px]">
        <TabButton active={activeTab === 'definition'} onClick={() => setActiveTab('definition')} label={tt('tabDefinition')} />
        <TabButton active={activeTab === 'context'} onClick={() => setActiveTab('context')} label={tt('tabContext')} />
        <TabButton active={activeTab === 'execution'} onClick={() => setActiveTab('execution')} label={tt('tabExecution')} />
        <TabButton active={activeTab === 'artifacts'} onClick={() => setActiveTab('artifacts')} label={tt('tabArtifacts')} />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {activeTab === 'definition' && (
          <TicketTabDefinition
            ticket={currentTicket}
            allTickets={allTickets}
            epics={epics}
            repos={repos}
            locale={locale}
            statusLabels={statusLabels}
            priorityLabels={priorityLabels}
            formLabelClass={formLabelClass}
            sectionCardClass={sectionCardClass}
            inputClass={inputClass}
            selectClass={selectClass}
            onTicketChange={setCurrentTicket}
            onFieldChange={field}
            onSaveTicket={(nextTicket) => void save(nextTicket)}
          />
        )}

        {activeTab === 'context' && (
          <TicketTabContext
            contextLoading={contextLoading}
            contextPreview={contextPreview}
            copying={copying}
            secondaryButtonClass={secondaryButtonClass}
            onRefresh={() => void refreshContext()}
            onCopy={onContextCopy}
          />
        )}

        {activeTab === 'execution' && (
          <TicketTabExecution
            ticket={currentTicket}
            storedRepos={storedRepos}
            workspaceId={workspaceId}
            workspacePath={workspace.workspacePath}
            selectedRepoPath={selectedRepoPath}
            formLabelClass={formLabelClass}
            selectClass={selectClass}
            executionRunning={executionRunning}
            executionError={executionError}
            executionMessage={executionMessage}
            executionLaunchKey={executionLaunchKey}
            onRepoPathChange={setExecutionRepoPath}
            onLaunch={() => void launchDevStory()}
            onDone={handleExecutionDone}
          />
        )}

        {activeTab === 'artifacts' && (
          <TicketTabArtifacts
            targetRepo={targetRepo}
            ticketId={currentTicket.id}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick(): void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-t-[10px] border-none border-b-2 bg-transparent px-2.5 pb-2 pt-2.5 text-[11px] font-semibold',
        active
          ? 'border-b-[var(--primary)] text-[var(--primary)]'
          : 'border-b-transparent text-[var(--text-muted)]',
      )}
    >
      {label}
    </button>
  );
}
