import { Loader2, Sparkles } from 'lucide-react';

/**
 * Generic "Create with AI" modal shared by Rules / Subagents / Output styles.
 *
 * The non-tech-friendly path is the agent: the user types a filename, hits
 * "Generate with AI", and the runner takes over from there. Manual creation
 * is intentionally NOT exposed here — users who want to scaffold a file by
 * hand can do so in their IDE.
 *
 * String labels are passed in as props so each consumer can scope its own
 * i18n bundle.
 */
export interface CreateEntityModalProps {
  /** Current name input value (controlled). */
  value: string;
  /** Inline error message (e.g. validation, IPC failure). */
  error: string | null;
  /** True while the AI run is being launched — disables the primary button. */
  launchingAi: boolean;
  /** False if the host doesn't have a `onOpenRunTab` callback (then AI is unavailable). */
  aiAvailable: boolean;
  onChange(next: string): void;
  onCancel(): void;
  onCreateWithAi(): void;
  /** Localised strings. */
  labels: {
    title: string;
    hint: string;
    placeholder: string;
    cancel: string;
    ai: string;
    launching: string;
    aiUnavailable: string;
  };
}

export default function CreateEntityModal({
  value,
  error,
  launchingAi,
  aiAvailable,
  onChange,
  onCancel,
  onCreateWithAi,
  labels,
}: CreateEntityModalProps) {
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-[480px] rounded-n-lg border border-n-border-default bg-n-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="m-0 mb-2 text-[14px] font-semibold text-n-fg">{labels.title}</h3>
        <p className="m-0 mb-4 text-[12px] text-n-muted">{labels.hint}</p>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && aiAvailable) onCreateWithAi();
            else if (e.key === 'Escape') onCancel();
          }}
          placeholder={labels.placeholder}
          disabled={launchingAi}
          className="w-full rounded-n-sm border border-n-border-subtle bg-n-sunken px-3 py-2 font-n-mono text-[12.5px] text-n-fg placeholder:text-n-faint outline-none focus:border-n-accent-line disabled:opacity-50"
        />
        {error && <p className="m-0 mt-2 text-[11.5px] text-n-critical">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={launchingAi}
            className="rounded-n-sm px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:text-n-fg disabled:opacity-50"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={onCreateWithAi}
            disabled={launchingAi || !value.trim() || !aiAvailable}
            title={!aiAvailable ? labels.aiUnavailable : undefined}
            className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent hover:bg-n-accent-line hover:text-n-canvas disabled:opacity-50 disabled:hover:bg-n-accent-soft disabled:hover:text-n-accent"
          >
            {launchingAi ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {launchingAi ? labels.launching : labels.ai}
          </button>
        </div>
      </div>
    </div>
  );
}
