import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentRunKind } from '@nakiros/shared';
import { computeLineDiff, type DiffLine } from '../../../lib/line-diff';
import type { QuoteSelection } from './types';

interface IdeCodeViewerProps {
  runId: string;
  runKind: AgentRunKind;
  /** The currently-selected file path (relative), or null when none. */
  selectedFile: string | null;
  /**
   * Revision counter — bump to invalidate the cached content and re-fetch.
   * Typically incremented when a write-tool event is received.
   */
  revision: number;
  /** Whether the agent is currently running — shows the "Agent is editing" badge. */
  isRunning: boolean;
  /**
   * Called when the user clicks "Quote in chat".  Receives the selection
   * metadata (file, lines, snippet) so the host can push it to the composer.
   */
  onQuote(selection: QuoteSelection): void;
}

interface FileContent {
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}

// ─── Floating quote button ────────────────────────────────────────────────────

interface FloatingQuoteButtonProps {
  label: string;
  position: { top: number; left: number };
  onClick(): void;
}

function FloatingQuoteButton({ label, position, onClick }: FloatingQuoteButtonProps) {
  return (
    // Inline style is necessary here — the position is derived from native
    // browser selection geometry (getBoundingClientRect) which cannot be
    // expressed as a static Tailwind class.
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent mousedown from collapsing the selection before the click fires.
        e.preventDefault();
        onClick();
      }}
      style={{ top: position.top, left: position.left }}
      className="pointer-events-auto fixed z-50 rounded-n-sm border border-n-border-default bg-n-surface px-2 py-1 font-n-mono text-[11px] font-medium text-n-accent shadow-md transition-colors hover:bg-n-sunken hover:text-n-fg focus:outline-none focus-visible:ring-1 focus-visible:ring-n-accent"
    >
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Centre pane of the IDE run layout.  Renders the **modified** content of the
 * currently-selected file with:
 * - Line numbers in a gutter.
 * - Green background for added lines, red struck-through for removed lines.
 * - A floating "Quote in chat" button that appears when the user selects text,
 *   reporting back the file path, line range, and snippet.
 *
 * Content is fetched via the appropriate `readXxxDiffFile` IPC channel.  The
 * result is cached in component state and invalidated when `revision` changes.
 * Read-only in v1 — no in-place editing.
 */
export default function IdeCodeViewer({
  runId,
  runKind,
  selectedFile,
  revision,
  isRunning,
  onQuote,
}: IdeCodeViewerProps) {
  const { t } = useTranslation('runs');
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRevRef = useRef(0);
  const preRef = useRef<HTMLPreElement>(null);

  // Quote-button state: visible only while a text selection intersects our <pre>.
  const [quotePos, setQuotePos] = useState<{ top: number; left: number } | null>(null);
  const pendingSelectionRef = useRef<{ startLine: number; endLine: number; snippet: string } | null>(null);

  const readDiffFile = useMemo(() => {
    if (runKind === 'fix') return window.nakiros.readFixDiffFile;
    if (runKind === 'create') return window.nakiros.readCreateDiffFile;
    if (runKind === 'edit') return window.nakiros.readEditDiffFile;
    return null;
  }, [runKind]);

  const fetchContent = useCallback(
    (resetUI: boolean) => {
      if (!selectedFile || !readDiffFile) {
        setContent(null);
        setLoading(false);
        setError(null);
        return;
      }
      const rev = ++fetchRevRef.current;
      if (resetUI) {
        setLoading(true);
        setError(null);
        setContent(null);
      }
      readDiffFile(runId, selectedFile)
        .then((payload) => {
          if (fetchRevRef.current !== rev) return;
          setContent({
            originalContent: payload.originalContent,
            modifiedContent: payload.modifiedContent,
            isBinary: payload.isBinary,
          });
          setError(null);
        })
        .catch((err: unknown) => {
          if (fetchRevRef.current !== rev) return;
          if (resetUI) setError(err instanceof Error ? err.message : String(err));
          // background polls don't surface their errors — they'd flash the UI
        })
        .finally(() => {
          if (fetchRevRef.current === rev) setLoading(false);
        });
    },
    [runId, selectedFile, readDiffFile],
  );

  // Fetch on file open or revision bump (write-tool event).
  useEffect(() => {
    fetchContent(true);
  }, [fetchContent, revision]);

  // Low-frequency safety-net poll while the agent is actively editing — mirrors
  // the file list. Catches mutations that arrive between IPC events (or when
  // the daemon flushed the diff data after the event was already broadcast).
  useEffect(() => {
    if (!isRunning || !selectedFile) return;
    const timer = setInterval(() => fetchContent(false), 4000);
    return () => clearInterval(timer);
  }, [isRunning, selectedFile, fetchContent]);

  // Compute the annotated diff lines from original + modified content.
  const diffLines = useMemo<DiffLine[] | null>(() => {
    if (!content) return null;
    if (content.isBinary) return null;
    const modified = content.modifiedContent ?? '';
    const original = content.originalContent ?? '';
    return computeLineDiff(original, modified);
  }, [content]);

  // ── Selection → quote handler ───────────────────────────────────────────

  const handleSelectionChange = useCallback(() => {
    if (!preRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setQuotePos(null);
      pendingSelectionRef.current = null;
      return;
    }
    const range = sel.getRangeAt(0);
    // Check that the selection is inside our <pre>.
    if (!preRef.current.contains(range.commonAncestorContainer)) {
      setQuotePos(null);
      pendingSelectionRef.current = null;
      return;
    }

    // Walk the selected nodes to collect the line numbers they sit on.
    // Each rendered line is a <span data-lineno="N"> child of the <pre>.
    const preChildren = Array.from(preRef.current.children) as HTMLElement[];

    let minLine = Infinity;
    let maxLine = -Infinity;
    const snippetLines: string[] = [];

    for (const span of preChildren) {
      const lineNo = parseInt(span.getAttribute('data-lineno') ?? '0', 10);
      if (!lineNo) continue;
      if (!sel.containsNode(span, /* partial */ true)) continue;
      if (lineNo < minLine) minLine = lineNo;
      if (lineNo > maxLine) maxLine = lineNo;
      // The line text is the last text node in the span (after the gutter number).
      const textEl = span.querySelector('[data-line-text]');
      if (textEl) snippetLines.push(textEl.textContent ?? '');
    }

    if (minLine === Infinity) {
      setQuotePos(null);
      pendingSelectionRef.current = null;
      return;
    }

    const rect = range.getBoundingClientRect();
    setQuotePos({ top: rect.top - 32, left: rect.left });
    pendingSelectionRef.current = {
      startLine: minLine,
      endLine: maxLine,
      snippet: snippetLines.join('\n'),
    };
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const handleQuoteClick = useCallback(() => {
    if (!pendingSelectionRef.current || !selectedFile) return;
    const { startLine, endLine, snippet } = pendingSelectionRef.current;
    onQuote({ filePath: selectedFile, startLine, endLine, snippet });
    // Clear the floating button.
    setQuotePos(null);
    pendingSelectionRef.current = null;
    window.getSelection()?.removeAllRanges();
  }, [onQuote, selectedFile]);

  // ── Rendering ───────────────────────────────────────────────────────────

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center bg-n-canvas">
        <p className="font-n-mono text-[12px] text-n-faint">
          {t('ide.noFileSelected', { defaultValue: 'No file selected' })}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-n-canvas">
        <p className="font-n-mono text-[12px] text-n-muted">
          {t('ide.loadingFile', { defaultValue: 'Loading…' })}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-n-canvas">
        <p className="m-4 rounded-n-sm border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[11px] text-n-critical break-all">
          {error}
        </p>
      </div>
    );
  }

  if (content?.isBinary) {
    return (
      <div className="flex h-full items-center justify-center bg-n-canvas">
        <p className="font-n-mono text-[12px] text-n-faint">
          {t('ide.binaryFile', { defaultValue: 'Binary file — preview unavailable.' })}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-n-canvas">
      {/* Sticky filename bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-n-border-subtle bg-n-surface px-4 py-2">
        <span
          className="min-w-0 flex-1 break-all font-n-mono text-[12px] text-n-fg"
          title={selectedFile}
        >
          {selectedFile}
        </span>
        {isRunning && (
          <span className="ml-3 shrink-0 rounded-n-sm border border-n-accent/40 bg-n-accent/10 px-2 py-0.5 font-n-mono text-[10px] font-medium text-n-accent">
            {t('ide.agentEditing', { defaultValue: 'Agent is editing' })}
          </span>
        )}
      </div>

      {/* Code body */}
      <div className="flex-1 overflow-auto">
        <pre
          ref={preRef}
          className="m-0 min-h-full p-0 font-n-mono text-[12px] leading-[1.6]"
          style={{ tabSize: 2 }}
        >
          {diffLines?.map((dl) => (
            <LineRow key={`${dl.kind}-${dl.lineNo}-${dl.line.slice(0, 20)}`} dl={dl} />
          ))}
          {/* Fallback: if originalContent is null (new file) render modifiedContent directly */}
          {!diffLines && content?.modifiedContent != null && (
            content.modifiedContent.split('\n').map((line, idx) => (
              <PlainLineRow key={idx} lineNo={idx + 1} line={line} />
            ))
          )}
          {!diffLines && !content?.modifiedContent && (
            <span className="px-4 font-n-mono text-[11px] text-n-faint">
              {t('ide.emptyFile', { defaultValue: '(empty file)' })}
            </span>
          )}
        </pre>
      </div>

      {/* Floating "Quote in chat" button — rendered in a portal-like fixed position */}
      {quotePos && (
        <FloatingQuoteButton
          label={t('ide.quoteInChat', { defaultValue: 'Quote in chat' })}
          position={quotePos}
          onClick={handleQuoteClick}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LineRow({ dl }: { dl: DiffLine }) {
  const isAdded = dl.kind === 'added';
  const isRemoved = dl.kind === 'removed';

  return (
    <span
      data-lineno={dl.lineNo}
      className={
        isAdded
          ? 'flex bg-emerald-500/10'
          : isRemoved
          ? 'flex bg-red-500/10'
          : 'flex'
      }
    >
      {/* Gutter */}
      <span
        aria-hidden
        className="w-12 shrink-0 select-none pr-4 text-right font-n-mono text-[11px] text-n-faint"
        style={{ userSelect: 'none' }}
      >
        {dl.lineNo}
      </span>
      {/* Change sigil — echoes the row highlight colour */}
      <span
        aria-hidden
        className={
          isAdded
            ? 'w-4 shrink-0 select-none font-n-mono text-[11px] text-emerald-400'
            : isRemoved
            ? 'w-4 shrink-0 select-none font-n-mono text-[11px] text-red-400'
            : 'w-4 shrink-0 select-none font-n-mono text-[11px]'
        }
        style={{ userSelect: 'none' }}
      >
        {isAdded ? '+' : isRemoved ? '−' : ' '}
      </span>
      {/* Line text */}
      <span
        data-line-text
        className={
          isAdded
            ? 'flex-1 whitespace-pre-wrap break-all text-emerald-200'
            : isRemoved
            ? 'flex-1 whitespace-pre-wrap break-all text-red-200'
            : 'flex-1 whitespace-pre-wrap break-all text-n-fg'
        }
      >
        {dl.line}
      </span>
      {/* Trailing newline to preserve copy–paste behaviour */}
      {'\n'}
    </span>
  );
}

function PlainLineRow({ lineNo, line }: { lineNo: number; line: string }) {
  return (
    <span data-lineno={lineNo} className="flex">
      <span
        aria-hidden
        className="w-12 shrink-0 select-none pr-4 text-right font-n-mono text-[11px] text-n-faint"
        style={{ userSelect: 'none' }}
      >
        {lineNo}
      </span>
      <span className="w-4 shrink-0 select-none text-[11px]" aria-hidden> </span>
      <span data-line-text className="flex-1 whitespace-pre-wrap break-all text-n-fg">
        {line}
      </span>
      {'\n'}
    </span>
  );
}
