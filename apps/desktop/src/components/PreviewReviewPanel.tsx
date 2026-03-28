import { useEffect, useState } from 'react';
import { Check, CheckCheck, ChevronRight, FileText, Trash2 } from 'lucide-react';
function relativePath(root: string, file: string): string {
  return file.startsWith(root + '/') ? file.slice(root.length + 1) : file;
}
import { MarkdownViewer } from './ui/MarkdownViewer';

interface Props {
  previewRoot: string;
  workspaceSlug: string;
  files: string[];
  onApply(): Promise<void>;
  onDiscard(): void;
  onFileApplied?(): void;
}

// ─── File tree ────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

function buildTree(files: string[], root: string): TreeNode[] {
  const roots: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  for (const file of files) {
    const rel = relativePath(root, file);
    const parts = rel.split('/');

    let currentPath = root;
    let currentLevel = roots;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = `${currentPath}/${part}`;
      const isFile = i === parts.length - 1;

      if (!map.has(currentPath)) {
        const node: TreeNode = { name: part, path: isFile ? file : currentPath, type: isFile ? 'file' : 'dir', children: [] };
        map.set(currentPath, node);
        currentLevel.push(node);
      }

      if (!isFile) {
        currentLevel = map.get(currentPath)!.children;
      }
    }
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children);
    }
    return nodes;
  }

  return sortNodes(roots);
}

// ─── Tree node component ──────────────────────────────────────────────────────

function TreeNodeItem({ node, selectedPath, depth, onSelect, onApplyFile }: {
  node: TreeNode;
  selectedPath: string | null;
  depth: number;
  onSelect(path: string): void;
  onApplyFile(path: string): void;
}) {
  const [expanded, setExpanded] = useState(true);
  const indent = depth * 12;

  if (node.type === 'dir') {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight className={`size-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          {node.name}
        </button>
        {expanded && node.children.map((child) => (
          <TreeNodeItem key={child.path} node={child} selectedPath={selectedPath} depth={depth + 1} onSelect={onSelect} onApplyFile={onApplyFile} />
        ))}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <div
      className={`group flex w-full items-center gap-1.5 px-2 py-0.5 text-[12px] transition-colors ${isSelected ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}`}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onSelect(node.path)}>
        <FileText className="size-3 shrink-0 opacity-60" />
        <span className="truncate">{node.name}</span>
      </button>
      <button
        type="button"
        title="Valider ce fichier"
        onClick={(e) => { e.stopPropagation(); onApplyFile(node.path); }}
        className="invisible shrink-0 rounded p-0.5 text-[var(--primary)] hover:bg-[var(--primary)]/10 group-hover:visible"
      >
        <Check className="size-3" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PreviewReviewPanel({ previewRoot, workspaceSlug, files, onApply, onDiscard, onFileApplied }: Props) {
  const [remainingFiles, setRemainingFiles] = useState<string[]>(files);
  const [selectedFile, setSelectedFile] = useState<string | null>(files[0] ?? null);
  const [content, setContent] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const tree = buildTree(remainingFiles, previewRoot);

  useEffect(() => {
    if (!selectedFile) { setContent(null); return; }
    window.nakiros.readDoc(selectedFile)
      .then((c: string) => setContent(c))
      .catch(() => setContent(null));
  }, [selectedFile]);

  async function handleApply() {
    setApplying(true);
    try { await onApply(); } finally { setApplying(false); }
  }

  async function handleApplyFile(filePath: string) {
    await window.nakiros.previewApplyFile(previewRoot, filePath, workspaceSlug);
    setRemainingFiles((prev) => prev.filter((f) => f !== filePath));
    if (selectedFile === filePath) setSelectedFile(null);
    onFileApplied?.();
  }

  return (
    <div className="flex h-full flex-col border-l border-[var(--line)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">
          Preview — {files.length} fichier{files.length > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={applying}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] disabled:opacity-50"
          >
            <Trash2 className="size-3" />
            Supprimer
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            className="flex items-center gap-1 rounded bg-[var(--primary)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/20 disabled:opacity-50"
          >
            <CheckCheck className="size-3" />
            {applying ? 'Application…' : 'Valider'}
          </button>
        </div>
      </div>

      {/* Body: tree + viewer */}
      <div className="flex min-h-0 flex-1">
        {/* File tree */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--line)] py-1">
          {tree.map((node) => (
            <TreeNodeItem key={node.path} node={node} selectedPath={selectedFile} depth={0} onSelect={setSelectedFile} onApplyFile={handleApplyFile} />
          ))}
        </div>

        {/* Content viewer */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {content !== null ? (
            <MarkdownViewer content={content} />
          ) : (
            <p className="text-[12px] text-[var(--text-muted)]">Sélectionnez un fichier</p>
          )}
        </div>
      </div>
    </div>
  );
}
