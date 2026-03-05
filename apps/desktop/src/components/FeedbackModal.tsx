import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Select, Textarea } from './ui';

interface Props {
  onClose: () => void;
  onToast: (message: string) => void;
}

type Category = 'bug' | 'suggestion' | 'agent' | 'workflow' | 'ux';
type Status = 'idle' | 'sending' | 'error';

export default function FeedbackModal({ onClose, onToast }: Props) {
  const { t } = useTranslation('feedback');
  const [category, setCategory] = useState<Category>('suggestion');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const canSend = message.length >= 10 && status !== 'sending';

  async function handleSend() {
    if (!canSend) return;
    setStatus('sending');
    try {
      await window.nakiros.sendProductFeedback({ category, message });
      onClose();
      onToast(t('thanks'));
    } catch {
      setStatus('error');
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={t('productTitle')} size="sm">
      <div className="flex flex-col gap-4">
        <Select
          label={t('categoryLabel')}
          value={category}
          onChange={(event) => setCategory(event.target.value as Category)}
          options={[
            { value: 'bug', label: t('categoryBug') },
            { value: 'suggestion', label: t('categorySuggestion') },
            { value: 'agent', label: t('categoryAgent') },
            { value: 'workflow', label: t('categoryWorkflow') },
            { value: 'ux', label: t('categoryUx') },
          ]}
        />

        <Textarea
          label={t('messageLabel')}
          hint={t('messageMin')}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          maxLength={2000}
          autoFocus
        />

        {status === 'error' && <p className="text-xs text-[var(--danger)]">{t('errorNetwork')}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void handleSend()} disabled={!canSend} loading={status === 'sending'}>
            {t('send')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
