import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentRunKind } from '@nakiros/shared';
import { Prism, themes } from 'prism-react-renderer';
import type { Token } from 'prism-react-renderer';
import { computeLineDiff, type DiffLine } from '../../../lib/line-diff';
import type { QuoteSelection } from './types';

// ─── Theme ────────────────────────────────────────────────────────────────────

const codeTheme = themes.vsDark;

// Build a quick lookup map: token type → CSS color string, from the theme.
const tokenColorMap: Record<string, string> = {};
for (const entry of codeTheme.styles) {
  if (entry.style.color) {
    for (const type of entry.types) {
      tokenColorMap[type] = entry.style.color;
    }
  }
}

/** Resolve the color for a token given its types array (last match wins, like CSS). */
function tokenColor(types: string[]): string | undefined {
  for (let i = types.length - 1; i >= 0; i--) {
    const c = tokenColorMap[types[i]];
    if (c) return c;
  }
  return undefined;
}

// ─── Language detection ───────────────────────────────────────────────────────

/**
 * Detect a Prism language name from a file path.
 * Handles synthetic paths like `.claude/settings.json (hooks)` by stripping
 * the trailing parenthetical before checking the extension.
 */
function detectLanguage(filePath: string): string {
  // Strip trailing annotation like " (hooks)" or " (permissions)".
  const cleanPath = filePath.replace(/\s*\([^)]*\)\s*$/, '');
  const lower = cleanPath.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'bash';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'markup';
  return 'plain';
}

// ─── Large-file threshold ─────────────────────────────────────────────────────

/**
 * If a file exceeds this line count we skip syntax highlighting and fall back
 * to plain text rendering.  Prism is synchronous and fast for normal .claude/
 * files, but we don't want to block the render thread on huge generated files.
 */
const MAX_HIGHLIGHTED_LINES = 3000;

// ─── Token-line renderer ──────────────────────────────────────────────────────

/**
 * Render a single array of Prism tokens as inline <span> elements.
 * Each token gets its theme color via an inline style; the outer wrapper
 * carries data-line-text so the quote handler can collect plain text.
 */
function TokenizedLineContent({
  tokens,
  plainText,
  className,
}: {
  tokens: Token[] | null;
  plainText: string;
  className: string;
}) {
  if (!tokens) {
    return (
      <span data-line-text className={className}>
        {plainText}
      </span>
    );
  }

  return (
    <span data-line-text className={className}>
      {tokens.map((token, i) => {
        const color = tokenColor(token.types);
        return (
          <span key={i} style={color ? { color } : undefined}>
            {token.content}
          </span>
        );
      })}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Line row sub-components ──────────────────────────────────────────────────

interface LineRowProps {
  dl: DiffLine;
  /** Pre-computed token array for this line, or null to fall back to plain text. */
  tokens: Token[] | null;
}

function LineRow({ dl, tokens }: LineRowProps) {
  const isAdded = dl.kind === 'added';
  const isRemoved = dl.kind === 'removed';

  const lineTextClass = isAdded
    ? 'flex-1 whitespace-pre-wrap break-all text-emerald-200'
    : isRemoved
    ? 'flex-1 whitespace-pre-wrap break-all text-red-200'
    : 'flex-1 whitespace-pre-wrap break-all text-n-fg';

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
      {/* Line text — tokenized if available, plain otherwise */}
      <TokenizedLineContent
        tokens={tokens}
        plainText={dl.line}
        className={lineTextClass}
      />
      {/* Trailing newline to preserve copy–paste behaviour */}
      {'\n'}
    </span>
  );
}

function PlainLineRow({
  lineNo,
  line,
  tokens,
}: {
  lineNo: number;
  line: string;
  tokens: Token[] | null;
}) {
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
      <TokenizedLineContent
        tokens={tokens}
        plainText={line}
        className="flex-1 whitespace-pre-wrap break-all text-n-fg"
      />
      {'\n'}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Centre pane of the IDE run layout.  Renders the **modified** content of the
 * currently-selected file with:
 * - Line numbers in a gutter.
 * - Green background for added lines, red struck-through for removed lines.
 * - Syntax highlighting via `prism-react-renderer` (vsDark theme), tokenizing
 *   the full file for correct multi-line context.
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

  // ── Syntax highlighting ─────────────────────────────────────────────────

  const language = useMemo(
    () => (selectedFile ? detectLanguage(selectedFile) : 'plain'),
    [selectedFile],
  );

  /**
   * Tokenize the FULL original and modified content separately so multi-line
   * syntax constructs (string literals, JSX blocks, etc.) are handled correctly.
   * Returns null when the file is too large (> MAX_HIGHLIGHTED_LINES) or the
   * language is 'plain' — callers fall back to plain text rendering.
   */
  const originalTokenLines = useMemo<Token[][] | null>(() => {
    if (language === 'plain' || !content?.originalContent) return null;
    const lineCount = content.originalContent.split('\n').length;
    if (lineCount > MAX_HIGHLIGHTED_LINES) return null;
    try {
      // useTokenize is exported as a hook but the implementation is a pure
      // synchronous call — we call it outside of a hook via the underlying
      // Prism.tokenize path instead to avoid React rules-of-hooks issues.
      const grammar = Prism.languages[language];
      if (!grammar) return null;
      const rawTokens = Prism.tokenize(content.originalContent, grammar);
      return normalizeTokenLines(rawTokens);
    } catch {
      return null;
    }
  }, [content?.originalContent, language]);

  const modifiedTokenLines = useMemo<Token[][] | null>(() => {
    if (language === 'plain' || !content?.modifiedContent) return null;
    const lineCount = content.modifiedContent.split('\n').length;
    if (lineCount > MAX_HIGHLIGHTED_LINES) return null;
    try {
      const grammar = Prism.languages[language];
      if (!grammar) return null;
      const rawTokens = Prism.tokenize(content.modifiedContent, grammar);
      return normalizeTokenLines(rawTokens);
    } catch {
      return null;
    }
  }, [content?.modifiedContent, language]);

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
          {diffLines?.map((dl) => {
            // For removed lines look up originalTokenLines; for added/unchanged use modifiedTokenLines.
            const tokenLines = dl.kind === 'removed' ? originalTokenLines : modifiedTokenLines;
            // lineNo is 1-based; token arrays are 0-indexed.
            const lineTokens = tokenLines?.[dl.lineNo - 1] ?? null;
            return (
              <LineRow
                key={`${dl.kind}-${dl.lineNo}-${dl.line.slice(0, 20)}`}
                dl={dl}
                tokens={lineTokens}
              />
            );
          })}
          {/* Fallback: if originalContent is null (new file) render modifiedContent directly */}
          {!diffLines && content?.modifiedContent != null && (
            content.modifiedContent.split('\n').map((line, idx) => {
              const lineTokens = modifiedTokenLines?.[idx] ?? null;
              return (
                <PlainLineRow key={idx} lineNo={idx + 1} line={line} tokens={lineTokens} />
              );
            })
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert Prism's flat token array (returned by `Prism.tokenize`) into a
 * 2-D array of lines, where each inner array is the list of tokens on that
 * line.  Plain string tokens are promoted to `Token` objects with type
 * `['plain-text']`.
 *
 * This mirrors what `normalizeTokens` from `prism-react-renderer` does, but
 * we call it outside of React so we can use it in `useMemo` without needing
 * to render a `<Highlight>` element.
 */
function normalizeTokenLines(
  rawTokens: (string | import('prismjs').Token)[],
): Token[][] {
  const lines: Token[][] = [[]];

  function processToken(token: string | import('prismjs').Token, inheritedTypes: string[] = []): void {
    if (typeof token === 'string') {
      // A plain string — may span multiple lines; split on '\n'.
      const parts = token.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          // New line.
          lines.push([]);
        }
        if (parts[i]) {
          lines[lines.length - 1].push({
            types: [...inheritedTypes, 'plain-text'],
            content: parts[i],
          });
        }
      }
    } else {
      const types = [...inheritedTypes, token.type];
      const { content } = token;
      if (typeof content === 'string') {
        const parts = content.split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) lines.push([]);
          if (parts[i]) {
            lines[lines.length - 1].push({ types, content: parts[i] });
          }
        }
      } else if (Array.isArray(content)) {
        for (const child of content) {
          processToken(child as string | import('prismjs').Token, types);
        }
      }
    }
  }

  for (const token of rawTokens) {
    processToken(token);
  }

  return lines;
}
