import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Button } from '../ui';

interface SprintCompleteModalProps {
  sprint: BacklogSprint;
  doneCount: number;
  incompleteCount: number;
  isLoading?: boolean;
  onConfirm(): void;
  onClose(): void;
}

export default function SprintCompleteModal({
  sprint,
  doneCount,
  incompleteCount,
  isLoading = false,
  onConfirm,
  onClose,
}: SprintCompleteModalProps) {
  const { t } = useTranslation('backlog');

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('completeSprintTitle')}
      size="sm"
      closeOnOverlayClick={!isLoading}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-[var(--text)]">{sprint.name}</p>

        <div className="flex flex-col gap-1 rounded-lg bg-[var(--bg-soft)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
          <span>{t('completeSprintDoneCount', { count: doneCount })}</span>
          {incompleteCount > 0 && (
            <span>{t('completeSprintIncompleteCount', { count: incompleteCount })}</span>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            {t('completeSprintCancel')}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? '...' : t('completeSprintConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
