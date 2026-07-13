import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecoCard as RecoCardType } from '@nakiros/shared';
import { MarkdownViewer } from '../ui/MarkdownViewer';
import { ApplyRecoModal } from './ApplyRecoModal';

interface Props {
  card: RecoCardType;
  onApply(editedBrief: string): void;
  onDismiss(): void;
  onOpenRun(runId: string): void;
}

/**
 * One recommendation card: header (action badge / artifact type / target),
 * MarkdownViewer body, footer with action buttons.
 *
 * Behaviour by status:
 *   - `'pending'`   → Apply / Dismiss buttons
 *   - `'applied'`   → "Open run" button (links to the spawned downstream run)
 *   - `'dismissed'` → rendered as-is; visibility toggle lives in PatternDetail
 *
 * Target path uses `break-all` so long file paths remain auditable without
 * truncation (per `feedback_no_truncate_user_content`).
 */
export function RecoCard({ card, onApply, onDismiss, onOpenRun }: Props) {
  const { t } = useTranslation('recommendations');
  const [showModal, setShowModal] = useState(false);

  const isCreate = card.action === 'create';
  const targetDomain = card.route?.targetDomain ?? (card.artifactType === 'skill' ? 'techne' : 'hestia');

  return (
    <article className="border border-n-border-subtle rounded bg-n-surface mb-4 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-n-border-subtle bg-n-canvas">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Action badge */}
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-n-xs bg-n-accent/15 text-n-accent">
            {isCreate ? 'create' : 'fix'}
          </span>
          {/* Artifact type badge */}
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-n-xs bg-n-raised text-n-muted">
            {card.artifactType}
          </span>
          <span className="flex-shrink-0 font-n-mono text-[9.5px] text-n-faint">
            Argos → {t(`domains.${targetDomain}`)}
          </span>
          {/* Target path — shown only when it references an existing artefact */}
          {card.target !== 'new' && (
            <span className="text-xs text-n-muted font-n-mono break-all min-w-0">
              → {card.target}
            </span>
          )}
        </div>
        {/* Title */}
        <span className="flex-shrink-0 text-xs text-n-muted">{card.title}</span>
      </header>

      {/* Body */}
      <div className="px-4 py-3">
        <MarkdownViewer content={card.body} />
      </div>

      {/* Footer */}
      <footer className="px-4 py-2 border-t border-n-border-subtle flex items-center justify-end gap-2">
        {card.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={onDismiss}
              className="text-sm px-3 py-1.5 rounded border border-n-border-subtle hover:bg-n-raised text-n-muted"
            >
              {t('card.dismiss')}
            </button>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="text-sm px-3 py-1.5 rounded border border-n-accent-line bg-n-accent-soft text-n-accent hover:bg-n-accent-line hover:text-n-canvas"
            >
              {t('card.review', { domain: t(`domains.${targetDomain}`) })}
            </button>
          </>
        )}
        {card.status === 'applied' && card.appliedRunId && (
          <button
            type="button"
            onClick={() => onOpenRun(card.appliedRunId!)}
            className="text-sm px-3 py-1.5 rounded border border-n-border-subtle hover:bg-n-raised text-n-muted"
          >
            {t('card.openRun')} #{card.appliedRunId.slice(0, 6)}
          </button>
        )}
      </footer>

      {/* Apply confirmation modal */}
      {showModal && (
        <ApplyRecoModal
          card={card}
          onConfirm={(brief) => {
            setShowModal(false);
            onApply(brief);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </article>
  );
}
