import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  LocalEpic,
  LocalTicket,
  TicketPriority,
  TicketStatus,
} from '@nakiros/shared';
import type { TicketFieldUpdater } from './types';

interface TicketTabDefinitionProps {
  ticket: LocalTicket;
  allTickets: LocalTicket[];
  epics: LocalEpic[];
  repos: string[];
  locale: string;
  statusLabels: Record<TicketStatus, string>;
  priorityLabels: Record<TicketPriority, string>;
  formLabelClass: string;
  sectionCardClass: string;
  inputClass: string;
  selectClass: string;
  onTicketChange: Dispatch<SetStateAction<LocalTicket>>;
  onFieldChange: TicketFieldUpdater;
  onSaveTicket(ticket: LocalTicket): void;
}

export function TicketTabDefinition({
  ticket,
  allTickets,
  epics,
  repos,
  locale,
  statusLabels,
  priorityLabels,
  formLabelClass,
  sectionCardClass,
  inputClass,
  selectClass,
  onTicketChange,
  onFieldChange,
  onSaveTicket,
}: TicketTabDefinitionProps) {
  const { t } = useTranslation('ticket');
  const blockers = ticket.blockedBy
    .map((id) => allTickets.find((item) => item.id === id))
    .filter(Boolean) as LocalTicket[];
  const unblocks = allTickets.filter((item) => item.blockedBy.includes(ticket.id));
  const candidates = allTickets.filter((item) => item.id !== ticket.id && !ticket.blockedBy.includes(item.id));

  return (
    <>
      <textarea
        value={ticket.title}
        onChange={(event) => onTicketChange((prev) => ({ ...prev, title: event.target.value }))}
        onBlur={() => onFieldChange('title', ticket.title)}
        className="ui-form-control min-h-[58px] w-full resize-none rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] px-[10px] py-2 text-[17px] font-semibold leading-[1.4] text-[var(--text)]"
      />
      <div className="text-[11px] text-[var(--text-muted)]">
        {t('createdUpdated', {
          created: new Date(ticket.createdAt).toLocaleDateString(locale),
          updated: new Date(ticket.updatedAt).toLocaleDateString(locale),
        })}
      </div>

      <div className={sectionCardClass}>
        <label className={formLabelClass}>{t('steering')}</label>
        <div className="flex flex-wrap gap-2">
          <select value={ticket.status} onChange={(event) => onFieldChange('status', event.target.value as TicketStatus)} className={selectClass}>
            {(Object.keys(statusLabels) as TicketStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>

          <select value={ticket.priority} onChange={(event) => onFieldChange('priority', event.target.value as TicketPriority)} className={selectClass}>
            {(Object.keys(priorityLabels) as TicketPriority[]).map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>

          {epics.length > 0 && (
            <select value={ticket.epicId ?? ''} onChange={(event) => onFieldChange('epicId', event.target.value || undefined)} className={selectClass}>
              <option value="">{t('epic')}</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.name}
                </option>
              ))}
            </select>
          )}

          {repos.length > 0 && (
            <select value={ticket.repoName ?? ''} onChange={(event) => onFieldChange('repoName', event.target.value || undefined)} className={selectClass}>
              <option value="">{t('repo')}</option>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className={sectionCardClass}>
        <label className={formLabelClass}>{t('description')}</label>
        <textarea
          value={ticket.description ?? ''}
          onChange={(event) => onTicketChange((prev) => ({ ...prev, description: event.target.value }))}
          onBlur={() => onFieldChange('description', ticket.description)}
          className={`${inputClass} min-h-20 resize-y`}
        />
      </div>

      <div className={sectionCardClass}>
        <label className={formLabelClass}>{t('acceptanceCriteria')}</label>
        {ticket.acceptanceCriteria.map((criteria, index) => (
          <div key={index} className="mb-1.5 flex gap-1.5">
            <input
              value={criteria}
              onChange={(event) => {
                const next = [...ticket.acceptanceCriteria];
                next[index] = event.target.value;
                onTicketChange((prev) => ({ ...prev, acceptanceCriteria: next }));
              }}
              onBlur={() => onFieldChange('acceptanceCriteria', ticket.acceptanceCriteria)}
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={() => {
                const next = ticket.acceptanceCriteria.filter((_, itemIndex) => itemIndex !== index);
                onSaveTicket({ ...ticket, acceptanceCriteria: next });
              }}
              className="border-none bg-transparent text-sm text-[#ef4444]"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => onTicketChange((prev) => ({ ...prev, acceptanceCriteria: [...prev.acceptanceCriteria, ''] }))}
          className="border-none bg-transparent p-0 text-xs text-[var(--primary)]"
        >
          {t('addCriteria')}
        </button>
      </div>

      <div className={sectionCardClass}>
        <label className={formLabelClass}>{t('blockedBy')}</label>
        {blockers.map((blocker) => (
          <div key={blocker.id} className="mb-1.5 flex items-center gap-2">
            <span className={statusPillClass(blocker.status)}>{blocker.id}</span>
            <span className="flex-1 text-[13px]">{blocker.title}</span>
            <button
              onClick={() => onFieldChange('blockedBy', ticket.blockedBy.filter((id) => id !== blocker.id))}
              className="border-none bg-transparent text-sm text-[#ef4444]"
            >
              ✕
            </button>
          </div>
        ))}
        {candidates.length > 0 && (
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) onFieldChange('blockedBy', [...ticket.blockedBy, event.target.value]);
            }}
            className={selectClass}
          >
            <option value="">{t('addBlocker')}</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id} - {candidate.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {unblocks.length > 0 && (
        <div className={sectionCardClass}>
          <label className={formLabelClass}>{t('unblocks')}</label>
          {unblocks.map((nextTicket) => (
            <div key={nextTicket.id} className="mb-1 text-[13px] text-[var(--text-muted)]">
              {nextTicket.id} - {nextTicket.title}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function statusPillClass(status: TicketStatus): string {
  return clsx(
    'rounded-[10px] px-1.5 py-0.5 text-[11px]',
    status === 'done'
      ? 'bg-[#d1fae5] text-[#065f46]'
      : 'bg-[#fef3c7] text-[#92400e]',
  );
}

