import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoCard } from '@nakiros/shared';

interface Props {
  card: RecoCard;
  onConfirm(editedBrief: string): void;
  onClose(): void;
}

/**
 * Modal shown before applying a reco. Lets the user edit the brief that will
 * be sent verbatim to the downstream runner. Built in the n-* token style to
 * match the rest of the new-design shell.
 *
 * The brief textarea is `whitespace-pre-wrap` / `break-all` — no truncation
 * so the user can audit the exact content being sent.
 */
export function ApplyRecoModal({ card, onConfirm, onClose }: Props) {
  const { t } = useTranslation('recommendations');
  const [brief, setBrief] = useState(card.brief);

  const runKind = card.action === 'create' ? 'create' : 'edit';
  const targetDomain = card.route?.targetDomain ?? (card.artifactType === 'skill' ? 'techne' : 'hestia');
  const trimmed = brief.trim();

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[600px] max-h-[85vh] flex flex-col rounded-n-lg border border-n-border-default bg-n-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        tabIndex={-1}
        ref={(el) => {
          if (el) el.focus();
        }}
      >
        {/* Header */}
        <div className="mb-4">
          <h3 className="m-0 mb-1 text-[14px] font-semibold text-n-fg">
            {t('confirmApply.title', { domain: t(`domains.${targetDomain}`) })}
          </h3>
          <p className="m-0 text-[12px] leading-relaxed text-n-muted">
            {t('confirmApply.description', {
              kind: runKind,
              domain: t(`domains.${targetDomain}`),
            })}
          </p>
        </div>

        {/* Brief editor */}
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={16}
          className="w-full min-h-[300px] flex-1 resize-y font-n-mono text-sm bg-n-canvas border border-n-border-subtle rounded p-3 text-n-fg whitespace-pre-wrap break-all focus:outline-none focus:border-n-accent"
        />

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-n-sm px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:text-n-fg"
          >
            {t('confirmApply.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={trimmed.length === 0}
            className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent hover:bg-n-accent-line hover:text-n-canvas disabled:opacity-50"
          >
            {t('confirmApply.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
