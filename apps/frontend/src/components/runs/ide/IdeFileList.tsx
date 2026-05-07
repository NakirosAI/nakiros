import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, FileText, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { AgentRunKind } from '@nakiros/shared';

interface FileEntry {
  relativePath: string;
  addedLines: number;
  removedLines: number;
}

interface IdeFileListProps {
  runId: string;
  runKind: AgentRunKind;
  selectedFile: string | null;
  onSelectFile(relativePath: string): void;
  /**
   * Revision counter — bump it from the parent to force a re-fetch.  Used
   * when the event stream reports a tool mutation (Write / Edit / MultiEdit).
   */
  revision: number;
  /**
   * Whether the agent run is currently active.  When `true` the file list
   * polls at a low cadence (every 4 s) so changes are reflected even if an
   * IPC event is missed.  Polling stops automatically once the run finishes.
   */
  isRunning?: boolean;
  /**
   * Optional callback fired when the user clicks the Refresh button. The
   * parent bumps the shared `revision` so both this panel AND the code
   * viewer re-fetch in lockstep — keeping the two views consistent.
   */
  onRequestRefresh?(): void;
}

// ─── Tree model ───────────────────────────────────────────────────────────────

type TreeNode = TreeFolder | TreeFile;

interface TreeFolder {
  kind: 'folder';
  name: string;
  /** Path segments from root, joined with '/' (used as a stable key for collapse state). */
  path: string;
  children: TreeNode[];
}

interface TreeFile {
  kind: 'file';
  name: string;
  /** Full relative path from workdir root — unique. */
  path: string;
  addedLines: number;
  removedLines: number;
}

/**
 * Build a folder tree from a flat list of file entries. Files in the workdir
 * root land at the top level; nested files are grouped under their parent
 * folders. Folders are sorted before files at each level, alphabetically.
 */
function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeFolder = { kind: 'folder', name: '', path: '', children: [] };

  const ensureFolder = (parent: TreeFolder, segment: string, fullPath: string): TreeFolder => {
    let folder = parent.children.find(
      (c): c is TreeFolder => c.kind === 'folder' && c.name === segment,
    );
    if (!folder) {
      folder = { kind: 'folder', name: segment, path: fullPath, children: [] };
      parent.children.push(folder);
    }
    return folder;
  };

  for (const file of files) {
    const segments = file.relativePath.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    let current = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      const fullPath = segments.slice(0, i + 1).join('/');
      current = ensureFolder(current, segment, fullPath);
    }
    const fileName = segments[segments.length - 1]!;
    current.children.push({
      kind: 'file',
      name: fileName,
      path: file.relativePath,
      addedLines: file.addedLines,
      removedLines: file.removedLines,
    });
  }

  const sortChildren = (folder: TreeFolder) => {
    folder.children.sort((a, b) => {
      // Folders first, then files; alphabetical within each group.
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of folder.children) {
      if (child.kind === 'folder') sortChildren(child);
    }
  };
  sortChildren(root);

  return root.children;
}

/**
 * Right-hand pane of the IDE run layout. Renders the workdir as a collapsible
 * folder tree with a +N -M change indicator on each modified file row.
 */
export default function IdeFileList({
  runId,
  runKind,
  selectedFile,
  onSelectFile,
  revision,
  isRunning = false,
  onRequestRefresh,
}: IdeFileListProps) {
  const { t } = useTranslation('runs');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fetchRevRef = useRef(0);

  const listDiff = useMemo(() => {
    // The IDE file list shows ALL workdir files (changed + unchanged) so the
    // user can navigate even before the agent makes its first edit. The
    // legacy workspace panel keeps the default `includeUnchanged: false`.
    const opts = { includeUnchanged: true } as const;
    if (runKind === 'fix') return () => window.nakiros.listFixDiff(runId, opts);
    if (runKind === 'create') return () => window.nakiros.listCreateDiff(runId, opts);
    if (runKind === 'edit') return () => window.nakiros.listEditDiff(runId, opts);
    return null;
  }, [runId, runKind]);

  const fetchFiles = useCallback(async () => {
    if (!listDiff) return;
    const rev = ++fetchRevRef.current;
    setLoading(true);
    setError(null);
    try {
      const entries = await listDiff();
      if (fetchRevRef.current !== rev) return;
      setFiles(
        entries.map((e) => ({
          relativePath: e.relativePath,
          addedLines: e.addedLines ?? 0,
          removedLines: e.removedLines ?? 0,
        })),
      );
    } catch (err) {
      if (fetchRevRef.current !== rev) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (fetchRevRef.current === rev) setLoading(false);
    }
  }, [listDiff]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles, revision]);

  // Low-frequency safety-net poll while the agent is actively running.
  // This catches file mutations that arrive between IPC events (e.g. if a
  // tool event was emitted before the daemon flushed the diff data).
  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => void fetchFiles(), 4000);
    return () => clearInterval(timer);
  }, [isRunning, fetchFiles]);

  const tree = useMemo(() => buildTree(files), [files]);

  const toggleFolder = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-n-border-subtle bg-n-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-n-border-subtle px-3 py-2">
        <span className="font-n-mono text-[11px] font-semibold uppercase tracking-wide text-n-muted">
          {t('ide.filesTitle', { defaultValue: 'Files in workdir' })}
        </span>
        <button
          type="button"
          onClick={() => {
            // Bump the shared revision so both the file list and the code
            // viewer re-fetch — keeping the two views consistent.
            if (onRequestRefresh) onRequestRefresh();
            else void fetchFiles();
          }}
          disabled={loading}
          aria-label={t('ide.refresh', { defaultValue: 'Refresh file list' })}
          title={t('ide.refresh', { defaultValue: 'Refresh file list' })}
          className="flex items-center justify-center rounded-sm p-1 text-n-muted transition-colors hover:bg-n-sunken hover:text-n-fg disabled:opacity-40"
        >
          <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {error && (
          <p className="px-3 py-3 font-n-mono text-[11px] text-n-critical break-all">{error}</p>
        )}
        {!error && tree.length === 0 && !loading && (
          <p className="px-3 py-4 font-n-mono text-[11px] text-n-faint">
            {t('ide.noFiles', { defaultValue: 'No files yet.' })}
          </p>
        )}
        {tree.map((node) => (
          <TreeNodeRow
            key={node.kind === 'folder' ? `f:${node.path}` : `file:${node.path}`}
            node={node}
            depth={0}
            collapsed={collapsed}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onToggleFolder={toggleFolder}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Recursive row renderer ───────────────────────────────────────────────────

function TreeNodeRow({
  node,
  depth,
  collapsed,
  selectedFile,
  onSelectFile,
  onToggleFolder,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  selectedFile: string | null;
  onSelectFile(path: string): void;
  onToggleFolder(path: string): void;
}) {
  // The leading indent uses padding-left so the click target spans the row
  // even on deeply-nested entries.
  const indentPx = 8 + depth * 12;

  if (node.kind === 'folder') {
    const isCollapsed = collapsed.has(node.path);
    return (
      <>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-n-muted transition-colors hover:bg-n-sunken hover:text-n-fg"
          style={{ paddingLeft: `${indentPx}px` }}
          title={node.path}
        >
          {isCollapsed ? (
            <ChevronRight size={12} strokeWidth={2} className="shrink-0" />
          ) : (
            <ChevronDown size={12} strokeWidth={2} className="shrink-0" />
          )}
          <span className="truncate font-n-mono text-[11.5px] font-medium leading-snug">
            {node.name}
          </span>
        </button>
        {!isCollapsed &&
          node.children.map((child) => (
            <TreeNodeRow
              key={child.kind === 'folder' ? `f:${child.path}` : `file:${child.path}`}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              onToggleFolder={onToggleFolder}
            />
          ))}
      </>
    );
  }

  // File row
  const isSelected = node.path === selectedFile;
  const hasChanges = node.addedLines > 0 || node.removedLines > 0;
  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      title={node.path}
      className={clsx(
        'flex w-full items-center gap-2 px-2 py-1 text-left transition-colors',
        isSelected ? 'bg-n-accent/10 text-n-fg' : 'text-n-muted hover:bg-n-sunken hover:text-n-fg',
      )}
      style={{ paddingLeft: `${indentPx}px` }}
    >
      <FileText size={12} strokeWidth={2} className="shrink-0 opacity-60" />
      <span className="flex-1 truncate font-n-mono text-[11.5px] leading-snug">{node.name}</span>
      {hasChanges && (
        <span className="flex shrink-0 gap-1.5 font-n-mono text-[10px]">
          {node.addedLines > 0 && <span className="text-emerald-400">+{node.addedLines}</span>}
          {node.removedLines > 0 && <span className="text-red-400">−{node.removedLines}</span>}
        </span>
      )}
    </button>
  );
}
