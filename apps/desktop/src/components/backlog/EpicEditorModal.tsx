import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Input, Modal, Select, Textarea } from '../ui';

interface EpicEditorModalProps {
  epic: BacklogEpic | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: CreateEpicPayload | UpdateEpicPayload) => Promise<void>;
}

const EPIC_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function EpicEditorModal({ epic, isOpen, onClose, onConfirm }: EpicEditorModalProps) {
  const { t } = useTranslation('backlog');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(EPIC_COLORS[0]!);
  const [status, setStatus] = useState<BacklogEpic['status']>('backlog');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(epic?.name ?? '');
    setDescription(epic?.description ?? '');
    setColor(epic?.color ?? EPIC_COLORS[0]!);
    setStatus(epic?.status ?? 'backlog');
    setIsSaving(false);
  }, [epic, isOpen]);

  const statusOptions = useMemo(
    () => [
      { value: 'backlog', label: t('epicStatusBacklog') },
      { value: 'in_progress', label: t('epicStatusInProgress') },
      { value: 'done', label: t('epicStatusDone') },
    ],
    [t],
  );

  async function handleSubmit() {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);

    const payload = epic
      ? {
          name: name.trim(),
          description: description.trim() || null,
          color,
          status,
        } satisfies UpdateEpicPayload
      : {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
        } satisfies CreateEpicPayload;

    try {
      await onConfirm(payload);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      title={epic ? t('editEpicTitle') : t('createEpicTitle')}
      size="sm"
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t('epicNameLabel')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('epicNamePlaceholder')}
        />

        <Textarea
          label={t('epicDescriptionLabel')}
          value={description}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('epicDescriptionPlaceholder')}
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t('epicColorLabel')}
          </span>
          <div className="flex flex-wrap gap-2">
            {EPIC_COLORS.map((option) => {
              const isActive = color === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${isActive ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--line)] bg-[var(--bg-soft)]'}`}
                  onClick={() => setColor(option)}
                  aria-label={option}
                >
                  <span className="h-5 w-5 rounded-full" style={{ backgroundColor: option }} />
                </button>
              );
            })}
          </div>
          <Badge variant="info" className="self-start">
            {t('epicColorPreview')}
          </Badge>
        </div>

        {epic && (
          <Select
            label={t('epicStatusLabel')}
            value={status}
            options={statusOptions}
            onChange={(event) => setStatus(event.target.value as BacklogEpic['status'])}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('cancelCreate')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!name.trim() || isSaving}>
            {epic ? t('updateEpicButton') : t('createEpicConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
