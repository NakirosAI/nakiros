import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Textarea } from './ui';

interface PrdDraft {
  vision: string;
  users: string;
  problem: string;
  constraints: string;
}

interface Props {
  onClose(): void;
  onSubmit(message: string): Promise<void>;
}

export default function PrdAssistant({ onClose, onSubmit }: Props) {
  const { t } = useTranslation('context');
  const [draft, setDraft] = useState<PrdDraft>({
    vision: '',
    users: '',
    problem: '',
    constraints: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const prompt = useMemo(() => {
    return [
      '/nak-agent-brainstorming',
      '',
      t('prdPromptIntro'),
      '',
      `Vision: ${draft.vision || '-'}`,
      `${t('prdFieldUsers')}: ${draft.users || '-'}`,
      `${t('prdFieldProblem')}: ${draft.problem || '-'}`,
      `${t('prdFieldConstraints')}: ${draft.constraints || '-'}`,
      '',
      t('prdPromptOutro'),
    ].join('\n');
  }, [draft, t]);

  const canSubmit = draft.vision.trim() && draft.users.trim() && draft.problem.trim();

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus('submitting');
    setError(null);
    try {
      await onSubmit(prompt);
      onClose();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCopyPrompt() {
    await window.nakiros.writeClipboard(prompt);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('prdTitle')}
      size="lg"
      className="max-h-[calc(100vh-40px)] overflow-y-auto"
    >
      <p className="mb-0 mt-[-6px] text-xs text-[var(--text-muted)]">
        {t('prdSubtitle')}
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        <Textarea
          label={t('prdFieldVision')}
          value={draft.vision}
          onChange={(event) => setDraft((prev) => ({ ...prev, vision: event.target.value }))}
          rows={3}
          className="rounded-[10px]"
        />
        <Textarea
          label={t('prdFieldUsers')}
          value={draft.users}
          onChange={(event) => setDraft((prev) => ({ ...prev, users: event.target.value }))}
          rows={2}
          className="rounded-[10px]"
        />
        <Textarea
          label={t('prdFieldProblem')}
          value={draft.problem}
          onChange={(event) => setDraft((prev) => ({ ...prev, problem: event.target.value }))}
          rows={3}
          className="rounded-[10px]"
        />
        <Textarea
          label={t('prdFieldConstraints')}
          value={draft.constraints}
          onChange={(event) => setDraft((prev) => ({ ...prev, constraints: event.target.value }))}
          rows={2}
          className="rounded-[10px]"
        />
      </div>

      {error && (
        <p className="mb-0 mt-2.5 text-xs text-[var(--danger)]">{error}</p>
      )}

      <div className="mt-3.5 flex justify-between gap-2">
        <Button type="button" variant="secondary" onClick={() => void handleCopyPrompt()} className="rounded-[10px]">
          {t('prdCopyPrompt')}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="rounded-[10px]">
            {t('prdCancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || status === 'submitting'}
            className="rounded-[10px]"
          >
            {status === 'submitting' ? t('prdLaunching') : t('prdLaunch')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
