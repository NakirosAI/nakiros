import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Generic confirmation modal — shared across the screens that used to call
 * `window.confirm()`. Built in the n-* token style with a destructive variant
 * for delete actions.
 *
 * Pattern (calque {@link CreateEntityModal}): a fixed full-screen overlay
 * with click-outside to cancel, Esc to cancel, Enter to confirm.
 */
export interface ConfirmModalProps {
  /** Whether the modal is shown. When false the component renders null. */
  open: boolean;
  /** Modal title — short, action-oriented (e.g. "Supprimer la règle"). */
  title: string;
  /** Body text — explains what is about to happen and any irreversibility. */
  body: string;
  /** Label for the primary (destructive) button. */
  confirmLabel: string;
  /** Label for the secondary cancel button. */
  cancelLabel: string;
  /**
   * When `true`, the confirm button is styled with the critical token
   * (red). Default `true` because the most common usage is delete.
   */
  destructive?: boolean;
  /** When `true`, the confirm button shows a spinner and is disabled. */
  loading?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-[440px] rounded-n-lg border border-n-border-default bg-n-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          else if (e.key === 'Enter' && !loading) onConfirm();
        }}
        tabIndex={-1}
        ref={(el) => {
          // Focus the dialog so the keyboard handlers fire and the user can
          // dismiss with Esc immediately.
          if (el) el.focus();
        }}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-n-critical/30 bg-n-critical-soft/40 text-n-critical">
              <AlertTriangle size={14} strokeWidth={2.5} />
            </span>
          )}
          <div className="flex-1">
            <h3 className="m-0 mb-1 text-[14px] font-semibold text-n-fg">{title}</h3>
            <p className="m-0 break-words text-[12px] leading-relaxed text-n-muted">{body}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-n-sm px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:text-n-fg disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              destructive
                ? 'inline-flex items-center gap-1.5 rounded-n-sm border border-n-critical/40 bg-n-critical-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-critical hover:bg-n-critical/20 disabled:opacity-50'
                : 'inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent hover:bg-n-accent-line hover:text-n-canvas disabled:opacity-50'
            }
          >
            {loading && <Loader2 size={11} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
