import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LocalTicket, LocalEpic, TicketStatus, TicketPriority } from '@nakiros/shared';
import { Button, Input, Modal, Select } from './ui';
import { useForm } from '../hooks/useForm';

interface Props {
  initialStatus: TicketStatus;
  workspaceId: string;
  ticketPrefix: string;
  ticketCounter: number;
  epics: LocalEpic[];
  repos: string[];
  onCreated(ticket: LocalTicket): void;
  onClose(): void;
}

export default function TicketForm({
  initialStatus,
  workspaceId,
  ticketPrefix,
  ticketCounter,
  epics,
  repos,
  onCreated,
  onClose,
}: Props) {
  const { t } = useTranslation('board');
  const [saving, setSaving] = useState(false);
  const nextTicketId = `${ticketPrefix}-${String(ticketCounter + 1).padStart(3, '0')}`;
  const initialValues = useMemo(() => ({
    title: '',
    priority: 'medium' as TicketPriority,
    epicId: '',
    repoName: '',
  }), []);
  const { values, handleChange, reset, isValid } = useForm(initialValues, (nextValues) => (
    nextValues.title.trim() ? {} : { title: 'required' }
  ));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSaving(true);

    const ticket: LocalTicket = {
      id: nextTicketId,
      title: values.title.trim(),
      acceptanceCriteria: [],
      status: initialStatus,
      priority: values.priority,
      epicId: values.epicId || undefined,
      repoName: values.repoName || undefined,
      blockedBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await window.nakiros.saveTicket(workspaceId, ticket);
    setSaving(false);
    reset();
    onCreated(ticket);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={t('ticketFormTitle', { id: nextTicketId })}
      className="max-w-[480px]"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3.5"
      >
        <p className="-mt-1 mb-0.5 text-xs text-[var(--text-muted)]">
          {t('ticketFormEscHint')}
        </p>

        <Input
          autoFocus
          value={values.title}
          onChange={(e) => handleChange('title', e.target.value)}
          label={t('ticketFormTitleLabel')}
          placeholder={t('ticketFormTitlePlaceholder')}
          className="rounded-[10px] px-3 py-2 text-sm"
          required
        />

        <div className="flex gap-2">
          <Select
            value={values.priority}
            onChange={(e) => handleChange('priority', e.target.value as TicketPriority)}
            label={t('ticketFormPriorityLabel')}
            options={[
              { value: 'low', label: t('priorityLow') },
              { value: 'medium', label: t('priorityMedium') },
              { value: 'high', label: t('priorityHigh') },
            ]}
            containerClassName="flex-1"
            className="rounded-[10px] px-3 py-2 text-sm"
          />

          {epics.length > 0 && (
            <Select
              value={values.epicId}
              onChange={(e) => handleChange('epicId', e.target.value)}
              label={t('ticketFormEpicLabel')}
              options={[
                { value: '', label: t('ticketFormNoEpic') },
                ...epics.map((ep) => ({ value: ep.id, label: ep.name })),
              ]}
              containerClassName="flex-1"
              className="rounded-[10px] px-3 py-2 text-sm"
            />
          )}
        </div>

        {repos.length > 0 && (
          <Select
            value={values.repoName}
            onChange={(e) => handleChange('repoName', e.target.value)}
            label={t('ticketFormRepoLabel')}
            options={[
              { value: '', label: t('ticketFormRepoUnset') },
              ...repos.map((r) => ({ value: r, label: r })),
            ]}
            className="rounded-[10px] px-3 py-2 text-sm"
          />
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('ticketFormCancel')}
          </Button>
          <Button type="submit" disabled={!isValid || saving} loading={saving}>
            {saving ? t('ticketFormCreating') : t('ticketFormCreate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
