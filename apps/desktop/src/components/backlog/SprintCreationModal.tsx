import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FormField, Input, Modal, Textarea } from '../ui';

interface SprintCreationModalProps {
  isOpen: boolean;
  onClose(): void;
  onConfirm(payload: CreateSprintPayload): void;
}

function toUnixMs(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  const ts = new Date(dateStr).getTime();
  return isNaN(ts) ? undefined : ts;
}

export default function SprintCreationModal({ isOpen, onClose, onConfirm }: SprintCreationModalProps) {
  const { t } = useTranslation('backlog');
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [nameError, setNameError] = useState('');
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setGoal('');
      setStartDate('');
      setEndDate('');
      setNameError('');
      setDateError('');
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [isOpen]);

  function handleSubmit() {
    setNameError('');
    setDateError('');

    if (!name.trim()) {
      setNameError(t('sprintNameRequired'));
      return;
    }

    const startMs = toUnixMs(startDate);
    const endMs = toUnixMs(endDate);

    if (startMs != null && endMs != null && startMs > endMs) {
      setDateError(t('sprintDateRangeError'));
      return;
    }

    const payload: CreateSprintPayload = {
      name: name.trim(),
      ...(goal.trim() ? { goal: goal.trim() } : {}),
      ...(startMs != null ? { startDate: startMs } : {}),
      ...(endMs != null ? { endDate: endMs } : {}),
    };

    onConfirm(payload);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('createSprintTitle')} size="sm">
      <div className="flex flex-col gap-4">
        <FormField label={t('sprintNameLabel')} error={nameError}>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('sprintNamePlaceholder')}
          />
        </FormField>

        <FormField label={t('sprintGoalLabel')}>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
          />
        </FormField>

        <div className="flex gap-3">
          <FormField label={t('sprintStartDateLabel')} className="flex-1">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FormField>
          <FormField label={t('sprintEndDateLabel')} className="flex-1" error={dateError}>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            {t('createSprintCancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {t('createSprintConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
