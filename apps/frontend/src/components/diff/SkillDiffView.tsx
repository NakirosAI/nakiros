import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import clsx from 'clsx';
import { diffLines, type Change } from 'diff';

/** One file entry shown in the left-hand sidebar of the diff view. */
export interface SkillDiffFileEntry {
  relativePath: string;
  /** True if the file has content on the "original" side (before). */
  inOriginal: boolean;
  /** True if the file has content on the "modified" side (after). */
  inModified: boolean;
}

/**
 * Content of a single file on both sides of the diff, returned by the
 * caller-supplied fetcher. `isBinary` short-circuits rendering with a notice.
 */
export interface SkillDiffFileContent {
  originalContent: string | null;
  modifiedContent: string | null;
  isBinary: boolean;
}

/** All user-facing strings rendered by `SkillDiffView`. Populated by callers from i18n. */
export interface SkillDiffLabels {
  filesPanelTitle: string;
  originalColumn: string;
  modifiedColumn: string;
  missingFile: string;
  binaryNotice: string;
  identicalNotice: string;
  loading: string;
  errorTemplate: (message: string) => string;
  emptyState: string;
  sideOriginalOnly: string;
  sideModifiedOnly: string;
  sideBoth: string;
  addedLinesLabel: (count: number) => string;
  removedLinesLabel: (count: number) => string;
}

interface Props {
  files: SkillDiffFileEntry[];
  fetchDiff(relativePath: string): Promise<SkillDiffFileContent>;
  labels: SkillDiffLabels;
  /** Optional content rendered above the files/diff split (full-width). */
  headerSlot?: React.ReactNode;
  /** Key used to scope the fetch cache (e.g. skillName or runId). Changing it invalidates the cache. */
  cacheScope: string;
}

// ─── Module-level cache (scoped by a caller-chosen key) ──────────────────────

const diffCache = new Map<string, SkillDiffFileContent>();
const diffInflight = new Map<string, Promise<SkillDiffFileContent>>();

function cacheKey(scope: string, path: string): string {
  return `${scope}::${path}`;
}

function runFetch(
  scope: string,
  relativePath: string,
  fetcher: (path: string) => Promise<SkillDiffFileContent>,
): Promise<SkillDiffFileContent> {
  const key = cacheKey(scope, relativePath);
  const cached = diffCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = diffInflight.get(key);
  if (inflight) return inflight;
  const p = fetcher(relativePath)
    .then((diff) => {
      diffCache.set(key, diff);
      diffInflight.delete(key);
      return diff;
    })
    .catch((err) => {
      diffInflight.delete(key);
      throw err;
    });
  diffInflight.set(key, p);
  return p;
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Reusable side-by-side file diff with a left-hand file list. Used by
 * `FixReviewPanel` (fix runs) and the create-review flow. Lazy-loads each
 * file's content via the caller-supplied `fetchDiff` and memoises results
 * in a module-level cache keyed by `cacheScope::relativePath`.
 *
 * Sidebar items show added/removed line counts as soon as their diff is
 * fetched, so the user sees magnitude before opening each file.
 */
export default function SkillDiffView({ files, fetchDiff, labels, headerSlot, cacheScope }: Props) {
  const sortedFiles = useMemo(() => [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath)), [files]);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  useEffect(() => {
    setActiveFile(sortedFiles[0]?.relativePath ?? null);
  }, [sortedFiles]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {headerSlot}
      <div className="flex flex-1 overflow-hidden">
        <FileSidebar
          files={sortedFiles}
          activeFile={activeFile}
          onSelect={setActiveFile}
          labels={labels}
          fetchDiff={fetchDiff}
          cacheScope={cacheScope}
        />
        <div className="flex-1 overflow-hidden">
          {activeFile ? (
            <DiffPanel
              relativePath={activeFile}
              fetchDiff={fetchDiff}
              labels={labels}
              cacheScope={cacheScope}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              {labels.emptyState}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File sidebar ────────────────────────────────────────────────────────────

function FileSidebar({
  files,
  activeFile,
  onSelect,
  labels,
  fetchDiff,
  cacheScope,
}: {
  files: SkillDiffFileEntry[];
  activeFile: string | null;
  onSelect(path: string): void;
  labels: SkillDiffLabels;
  fetchDiff(path: string): Promise<SkillDiffFileContent>;
  cacheScope: string;
}) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-soft)]">
      <div className="border-b border-[var(--line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {labels.filesPanelTitle} ({files.length})
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map((file) => (
          <FileListItem
            key={file.relativePath}
            file={file}
            active={file.relativePath === activeFile}
            onClick={() => onSelect(file.relativePath)}
            labels={labels}
            fetchDiff={fetchDiff}
            cacheScope={cacheScope}
          />
        ))}
      </div>
    </div>
  );
}

function FileListItem({
  file,
  active,
  onClick,
  labels,
  fetchDiff,
  cacheScope,
}: {
  file: SkillDiffFileEntry;
  active: boolean;
  onClick(): void;
  labels: SkillDiffLabels;
  fetchDiff(path: string): Promise<SkillDiffFileContent>;
  cacheScope: string;
}) {
  const [counts, setCounts] = useState<{ added: number; removed: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    runFetch(cacheScope, file.relativePath, fetchDiff)
      .then((diff) => {
        if (cancelled) return;
        if (diff.isBinary) {
          setCounts({ added: 0, removed: 0 });
          return;
        }
        const changes = diffLines(diff.originalContent ?? '', diff.modifiedContent ?? '');
        let add = 0;
        let rem = 0;
        for (const ch of changes) {
          const n = ch.value.split('\n').filter((l) => l.length > 0).length;
          if (ch.added) add += n;
          else if (ch.removed) rem += n;
        }
        setCounts({ added: add, removed: rem });
      })
      .catch(() => {
        if (!cancelled) setCounts({ added: 0, removed: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [cacheScope, file.relativePath, fetchDiff]);

  const sideLabel = !file.inOriginal
    ? labels.sideModifiedOnly
    : !file.inModified
      ? labels.sideOriginalOnly
      : labels.sideBoth;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-2 text-left',
        active
          ? 'border-l-[var(--primary)] bg-[var(--bg-card)]'
          : 'border-l-transparent hover:bg-[var(--bg-muted)]',
      )}
    >
      <div className="flex w-full items-center gap-2">
        <FileText size={11} className="shrink-0 text-[var(--text-muted)]" />
        <span className="truncate font-mono text-[11px] text-[var(--text-primary)]">
          {file.relativePath}
        </span>
        {counts && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px]">
            {counts.added > 0 && (
              <span className="text-emerald-400">{labels.addedLinesLabel(counts.added)}</span>
            )}
            {counts.removed > 0 && (
              <span className="text-red-400">{labels.removedLinesLabel(counts.removed)}</span>
            )}
          </span>
        )}
      </div>
      <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {sideLabel}
      </span>
    </button>
  );
}

// ─── Diff panel ──────────────────────────────────────────────────────────────

function DiffPanel({
  relativePath,
  fetchDiff,
  labels,
  cacheScope,
}: {
  relativePath: string;
  fetchDiff(path: string): Promise<SkillDiffFileContent>;
  labels: SkillDiffLabels;
  cacheScope: string;
}) {
  const [diff, setDiff] = useState<SkillDiffFileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    runFetch(cacheScope, relativePath, fetchDiff)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheScope, relativePath, fetchDiff]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">{labels.loading}</div>
    );
  }
  if (err) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-red-400">
        {labels.errorTemplate(err)}
      </div>
    );
  }
  if (!diff) return null;
  if (diff.isBinary) {
    return <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">{labels.binaryNotice}</div>;
  }

  const original = diff.originalContent ?? '';
  const modified = diff.modifiedContent ?? '';
  if (original === modified) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">{labels.identicalNotice}</div>
    );
  }

  const rows = buildSideBySideRows(original, modified);
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 border-b border-[var(--line)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        <div className="border-r border-[var(--line)] bg-[var(--bg-soft)] px-3 py-1.5">
          {diff.originalContent == null ? labels.missingFile : labels.originalColumn}
        </div>
        <div className="bg-[var(--bg-soft)] px-3 py-1.5">
          {diff.modifiedContent == null ? labels.missingFile : labels.modifiedColumn}
        </div>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[11px] leading-snug">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <DiffCell side="original" line={row.original} kind={row.originalKind} />
                <DiffCell side="modified" line={row.modified} kind={row.modifiedKind} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LineKind = 'unchanged' | 'removed' | 'added' | 'empty';

interface SideBySideRow {
  original: { number: number | null; text: string };
  modified: { number: number | null; text: string };
  originalKind: LineKind;
  modifiedKind: LineKind;
}

function buildSideBySideRows(originalText: string, modifiedText: string): SideBySideRow[] {
  const changes: Change[] = diffLines(originalText, modifiedText);
  const rows: SideBySideRow[] = [];
  let originalLineNumber = 1;
  let modifiedLineNumber = 1;

  let pendingRemoved: { number: number; text: string }[] = [];

  function flushRemoved() {
    for (const rem of pendingRemoved) {
      rows.push({
        original: rem,
        modified: { number: null, text: '' },
        originalKind: 'removed',
        modifiedKind: 'empty',
      });
    }
    pendingRemoved = [];
  }

  for (const change of changes) {
    const lines = change.value.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    if (change.removed) {
      for (const text of lines) {
        pendingRemoved.push({ number: originalLineNumber++, text });
      }
      continue;
    }

    if (change.added) {
      for (const text of lines) {
        const paired = pendingRemoved.shift();
        if (paired) {
          rows.push({
            original: paired,
            modified: { number: modifiedLineNumber++, text },
            originalKind: 'removed',
            modifiedKind: 'added',
          });
        } else {
          rows.push({
            original: { number: null, text: '' },
            modified: { number: modifiedLineNumber++, text },
            originalKind: 'empty',
            modifiedKind: 'added',
          });
        }
      }
      flushRemoved();
      continue;
    }

    flushRemoved();
    for (const text of lines) {
      rows.push({
        original: { number: originalLineNumber++, text },
        modified: { number: modifiedLineNumber++, text },
        originalKind: 'unchanged',
        modifiedKind: 'unchanged',
      });
    }
  }

  flushRemoved();
  return rows;
}

function DiffCell({
  side,
  line,
  kind,
}: {
  side: 'original' | 'modified';
  line: { number: number | null; text: string };
  kind: LineKind;
}) {
  const toneClass = (() => {
    if (kind === 'unchanged') return '';
    if (kind === 'empty') return 'bg-[var(--bg-muted)]';
    if (kind === 'removed') return 'bg-red-500/10 text-red-200';
    if (kind === 'added') return 'bg-emerald-500/10 text-emerald-200';
    return '';
  })();
  const borderClass = side === 'original' ? 'border-r border-[var(--line)]' : '';
  const prefix = kind === 'added' ? '+' : kind === 'removed' ? '-' : kind === 'empty' ? ' ' : ' ';
  return (
    <td className={clsx('align-top', toneClass, borderClass)}>
      <div className="flex items-start gap-2 px-2">
        <span className="w-10 shrink-0 select-none pr-2 text-right text-[10px] text-[var(--text-muted)]">
          {line.number ?? ''}
        </span>
        <span className="w-3 shrink-0 select-none text-[var(--text-muted)]">{prefix}</span>
        <pre className="m-0 whitespace-pre-wrap break-words">{line.text}</pre>
      </div>
    </td>
  );
}

/**
 * Drop every cached + in-flight diff entry whose key starts with
 * `${cacheScope}::`. Call this when the underlying files change so the
 * diff view re-fetches on next mount (e.g. after a new agent turn in a
 * fix run).
 */
export function invalidateSkillDiffCache(cacheScope: string): void {
  for (const key of [...diffCache.keys()]) {
    if (key.startsWith(`${cacheScope}::`)) diffCache.delete(key);
  }
  for (const key of [...diffInflight.keys()]) {
    if (key.startsWith(`${cacheScope}::`)) diffInflight.delete(key);
  }
}
