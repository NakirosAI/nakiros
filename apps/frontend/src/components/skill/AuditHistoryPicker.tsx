import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, FileText } from 'lucide-react';
import { formatAuditTimestamp } from '../../lib/run-display';

/**
 * Minimal audit entry shape accepted by this picker. Both
 * `AuditHistoryEntry` (skill audits) and `ClaudeMdAuditHistoryEntry`
 * (CLAUDE.md audits) satisfy this interface so the same picker can be
 * reused across entity screens without duplicating the dropdown UI.
 *
 * `sizeBytes` is optional because `ClaudeMdAuditHistoryEntry` does not
 * carry it. When absent, the size column is simply omitted.
 */
export interface GenericAuditEntry {
  path: string;
  timestamp: string;
  sizeBytes?: number;
}

interface AuditHistoryPickerProps {
  /**
   * Available audit reports, expected most-recent-first.
   * Empty array → component renders a disabled "no audit yet" state.
   */
  entries: GenericAuditEntry[];
  /** Currently selected audit (or `null` until the first is picked). */
  selected: GenericAuditEntry | null;
  /** Activated when the user picks an entry from the dropdown. */
  onSelect(entry: GenericAuditEntry): void;
}

/**
 * Pill-style picker for an audit's history. Works for both skill audits
 * (`AuditHistoryEntry`) and CLAUDE.md audits (`ClaudeMdAuditHistoryEntry`)
 * by accepting the minimal {@link GenericAuditEntry} interface.
 *
 * The list is fetched by the parent — this component is purely presentational.
 * Click-outside dismisses the dropdown; the pill collapses to a disabled state
 * when no audit has been recorded yet.
 */
export default function AuditHistoryPicker({ entries, selected, onSelect }: AuditHistoryPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  if (entries.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 font-n-mono text-[11px] text-n-faint">
        <Clock size={11} strokeWidth={2} />
        no audit yet
      </span>
    );
  }

  const active = selected ?? entries[0]!;
  const isLatest = active.path === entries[0]!.path;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Audit history"
        className={
          'inline-flex h-6 items-center gap-1.5 rounded-[5px] border px-[9px] font-n-mono text-[11px] text-n-muted transition-colors ' +
          (open ? 'bg-n-raised ' : 'bg-transparent hover:bg-n-raised ') +
          'border-n-border-subtle'
        }
      >
        <Clock size={11} strokeWidth={2} className="text-n-subtle" />
        <span className="text-n-faint">audit ·</span>
        <span className="text-n-fg">{formatAuditTimestamp(active.timestamp)}</span>
        <span className="text-n-faint">·</span>
        <span className={isLatest ? 'text-n-accent' : 'text-n-watch'}>
          {isLatest ? 'latest' : 'archived'}
        </span>
        <ChevronDown
          size={11}
          strokeWidth={2.25}
          className={'text-n-subtle transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-50 w-[360px] overflow-hidden rounded-n-md border border-n-border-default bg-n-surface shadow-n-pop">
          <div className="max-h-[280px] overflow-y-auto">
            {entries.map((entry, idx) => {
              const isActive = entry.path === active.path;
              const tagline = idx === 0 ? 'latest' : `${idx} earlier`;
              return (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => {
                    onSelect(entry);
                    setOpen(false);
                  }}
                  className={
                    'flex w-full items-center gap-2.5 border-b border-n-border-subtle px-3 py-2.5 text-left transition-colors last:border-b-0 ' +
                    (isActive ? 'bg-n-accent-soft' : 'hover:bg-n-raised')
                  }
                >
                  <span
                    className={
                      'h-1.5 w-1.5 flex-shrink-0 rounded-full ' +
                      (isActive ? 'bg-n-accent' : idx === 0 ? 'bg-n-healthy' : 'bg-n-faint')
                    }
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-n-mono text-[12px] text-n-fg">
                      {formatAuditTimestamp(entry.timestamp)}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 font-n-mono text-[10.5px] text-n-subtle">
                      <span>{tagline}</span>
                      {entry.sizeBytes != null && (
                        <>
                          <span className="text-n-faint">·</span>
                          <span>{formatSize(entry.sizeBytes)}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <FileText size={12} strokeWidth={2} className="flex-shrink-0 text-n-faint" />
                </button>
              );
            })}
          </div>
          {/* TODO: open a dedicated audits overlay listing every report
              with the markdown content side-by-side. Placeholder for now. */}
          <button
            type="button"
            disabled
            className="block w-full border-t border-n-border-default bg-n-sunken px-3 py-2 text-left font-n-mono text-[11px] text-n-subtle opacity-60"
          >
            → View all audits <span className="text-n-faint">(soon)</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
