import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  RefreshCw,
} from 'lucide-react';
import type { Skill, SkillFileEntry } from '@nakiros/shared';
import type { SkillTabIdentity } from '../../hooks/useTabs';
import { readSkillFileByIdentity } from '../../lib/skill-identity';

interface SkillFilesTabProps {
  /** Cross-scope identity used to dispatch the `readSkillFile*` IPC. */
  identity: SkillTabIdentity;
  /** The skill currently displayed in the detail screen. */
  skill: Skill;
}

/**
 * Files tab — shows the skill's directory tree on the left and a
 * read-only preview of the selected file on the right.
 *
 * The tree shape (`SkillFileEntry[]`) is already loaded by
 * `listProjectSkills` — no extra IPC for the tree itself. Selecting a
 * file pulls its content via `readSkillFile`. Markdown leaves render
 * through the shared `MarkdownViewer`; everything else renders as
 * monospace text.
 *
 * Inspired by the legacy `FileTree` component
 * (`apps/frontend/src/views/skills/components.tsx:43`) but rebuilt
 * with OKLch tokens to fit the new shell.
 *
 * Edition is intentionally out of scope (the mockup doesn't surface
 * it either). The Save/Edit button can come back in a follow-up if
 * needed.
 */
export default function SkillFilesTab({ identity, skill }: SkillFilesTabProps) {
  const { t } = useTranslation('skills');

  const initialPath = useMemo(() => firstPreviewablePath(skill.files), [skill.files]);
  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath);

  return (
    <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden font-n-sans">
      <aside className="overflow-y-auto border-r border-n-border-subtle bg-n-sunken/40 py-2">
        {skill.files.length === 0 ? (
          <div className="px-3 py-6 text-center font-n-mono text-[11px] text-n-faint">
            {t('filesTab.empty', { defaultValue: 'No file in this skill folder.' })}
          </div>
        ) : (
          <FileTree
            entries={skill.files}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        )}
      </aside>
      <section className="overflow-y-auto">
        {selectedPath === null ? (
          <EmptyPreview text={t('filesTab.pickAFile', { defaultValue: 'Select a file to preview' })} />
        ) : (
          <FilePreview identity={identity} path={selectedPath} />
        )}
      </section>
    </div>
  );
}

// ── Tree ───────────────────────────────────────────────────────────────────

function FileTree({
  entries,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  entries: SkillFileEntry[];
  selectedPath: string | null;
  onSelect(path: string): void;
  depth?: number;
}) {
  return (
    <>
      {entries.map((entry) => (
        <TreeNode
          key={entry.relativePath}
          entry={entry}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </>
  );
}

function TreeNode({
  entry,
  selectedPath,
  onSelect,
  depth,
}: {
  entry: SkillFileEntry;
  selectedPath: string | null;
  onSelect(path: string): void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selectedPath === entry.relativePath;
  const paddingLeft = 8 + depth * 14;

  if (entry.isDirectory) {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 py-0.5 pr-2 text-left font-n-mono text-[10.5px] text-n-muted transition-colors hover:bg-n-raised hover:text-n-fg"
          style={{ paddingLeft }}
        >
          {expanded ? (
            <ChevronDown size={10} strokeWidth={2.25} className="text-n-subtle" />
          ) : (
            <ChevronRight size={10} strokeWidth={2.25} className="text-n-subtle" />
          )}
          <Folder size={10} strokeWidth={2.25} className="text-n-accent" />
          <span className="truncate">{entry.name}</span>
        </button>
        {expanded && entry.children && (
          <FileTree
            entries={entry.children}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.relativePath)}
      className={
        'flex w-full items-center gap-1.5 py-0.5 pr-2 text-left font-n-mono text-[10.5px] transition-colors ' +
        (isSelected
          ? 'bg-n-accent-soft text-n-accent-strong'
          : 'text-n-fg hover:bg-n-raised')
      }
      style={{ paddingLeft: paddingLeft + 14 }}
    >
      <FileIcon size={10} strokeWidth={2} className="flex-shrink-0 text-n-subtle" />
      <span className="truncate">{entry.name}</span>
      {entry.sizeBytes !== undefined && (
        <span className="ml-auto flex-shrink-0 text-[9.5px] text-n-faint">
          {formatSize(entry.sizeBytes)}
        </span>
      )}
    </button>
  );
}

// ── Preview ────────────────────────────────────────────────────────────────

function FilePreview({
  identity,
  path,
}: {
  identity: SkillTabIdentity;
  path: string;
}) {
  const { t } = useTranslation('skills');
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    readSkillFileByIdentity(identity, path)
      .then((data) => {
        if (cancelled) return;
        setContent(typeof data === 'string' ? data : '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    identity.scope,
    identity.skillName,
    identity.scope === 'project' ? identity.projectId : '',
    identity.scope === 'project' ? identity.provider : '',
    identity.scope === 'plugin' ? identity.marketplaceName : '',
    identity.scope === 'plugin' ? identity.pluginName : '',
    path,
  ]);

  const isMarkdown = path.toLowerCase().endsWith('.md');
  const isImage = isImagePath(path);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-n-border-subtle bg-n-surface px-4 py-2.5">
        <span className="truncate font-n-mono text-[11px] text-n-fg" title={path}>
          {path}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-3 py-2 font-n-mono text-[12px] text-n-critical">
            {error}
          </div>
        )}
        {!error && loading && (
          <div className="flex items-center gap-2 font-n-mono text-[12px] text-n-muted">
            <RefreshCw size={12} className="animate-spin" />
            {t('common:loading', { defaultValue: 'Loading…' })}
          </div>
        )}
        {!error && !loading && content !== null && content.trim() === '' && (
          <div className="font-n-mono text-[12px] text-n-faint">
            {t('filesTab.emptyFile', { defaultValue: 'This file is empty.' })}
          </div>
        )}
        {!error && !loading && content !== null && content.trim() !== '' && isImage && (
          <div className="font-n-mono text-[11px] text-n-faint">
            {t('filesTab.binary', { defaultValue: 'Image preview not supported here.' })}
          </div>
        )}
        {!error && !loading && content !== null && content.trim() !== '' && !isImage && isMarkdown && (
          <div className="rounded-n-lg border border-n-border-subtle bg-n-surface px-5 py-4">
            <SkillMarkdownPreview content={content} />
          </div>
        )}
        {!error && !loading && content !== null && content.trim() !== '' && !isImage && !isMarkdown && (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-n-md border border-n-border-subtle bg-n-surface px-3 py-2.5 font-n-mono text-[11px] leading-snug text-n-fg">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

function EmptyPreview({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center font-n-mono text-[11px] text-n-faint">
      {text}
    </div>
  );
}

// ── Markdown preview (new-shell sized) ─────────────────────────────────────

/**
 * Markdown renderer for the Files tab. Mirrors the new-shell type
 * scale ([12.5px] body, slightly larger for headings) instead of
 * pulling the legacy MarkdownViewer which renders in `text-sm`
 * (14px) and looks oversized next to the rest of the screen.
 */
function SkillMarkdownPreview({ content }: { content: string }) {
  return (
    <div className="font-n-sans text-[12.5px] leading-relaxed text-n-fg">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2.5 text-[16px] font-semibold text-n-fg">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-[14px] font-semibold text-n-fg">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-[13px] font-semibold text-n-fg">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-[12.5px] font-semibold text-n-fg">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="my-2 text-[12.5px] leading-relaxed text-n-fg">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-n-border-default pl-3 font-n-mono text-[11px] text-n-muted">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-[12.5px] text-n-muted">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-[12.5px] text-n-muted">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-n-accent underline underline-offset-2 hover:text-n-accent-strong"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = (className ?? '').includes('language-');
    if (isBlock) {
      return (
        <code
          className={
            'block whitespace-pre overflow-x-auto rounded-n-sm border border-n-border-subtle bg-n-sunken px-3 py-2 font-n-mono text-[11px] leading-relaxed text-n-fg ' +
            (className ?? '')
          }
        >
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-n-xs border border-n-border-subtle bg-n-sunken px-1 py-0.5 font-n-mono text-[11px] text-n-fg">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-n-md border border-n-border-subtle bg-n-sunken p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-4 border-n-border-subtle" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-n-md border border-n-border-subtle">
      <table className="w-full border-collapse text-[11.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-n-sunken/40 text-left font-n-mono text-[10.5px] uppercase tracking-[0.6px] text-n-subtle">
      {children}
    </thead>
  ),
  tr: ({ children }) => (
    <tr className="border-t border-n-border-subtle first:border-t-0">{children}</tr>
  ),
  th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top text-n-fg">{children}</td>,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick a sensible default file to preview when the user lands on the
 * Files tab — prefers SKILL.md at the root, falls back to the first
 * file we can find by depth-first walk.
 */
function firstPreviewablePath(entries: SkillFileEntry[]): string | null {
  const skillMd = entries.find((e) => !e.isDirectory && /^skill\.md$/i.test(e.name));
  if (skillMd) return skillMd.relativePath;
  return firstFileInTree(entries);
}

function firstFileInTree(entries: SkillFileEntry[]): string | null {
  for (const entry of entries) {
    if (!entry.isDirectory) return entry.relativePath;
    if (entry.children) {
      const nested = firstFileInTree(entry.children);
      if (nested) return nested;
    }
  }
  return null;
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i.test(path);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
