import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Eye,
  FileText,
  PlusCircle,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  ClaudeMdScope,
  ClaudeMdSummary,
  Project,
} from '@nakiros/shared';
import { MarkdownViewer } from '../components/ui/MarkdownViewer';
import { useClaudeMdFile, useClaudeMdList } from './claude-md/useClaudeMd';

interface ClaudeMdScreenProps {
  project: Project;
}

const SCOPES: ClaudeMdScope[] = ['root', 'claude-dir', 'local'];
const LINES_WARNING_THRESHOLD = 200;

/**
 * Editor for CLAUDE.md across the three project-scoped locations
 * (`./CLAUDE.md`, `./.claude/CLAUDE.md`, `./CLAUDE.local.md`). Three pill
 * tabs at the top, then a split layout: textarea (or rendered preview) on
 * the left, a metadata sidebar on the right with line count + lines
 * warning, token budget, headings, `@`-imports, AGENTS.md import
 * suggestion and HTML-comment hint.
 */
export default function ClaudeMdScreen({ project }: ClaudeMdScreenProps) {
  const { t } = useTranslation('claude-md');
  const { list, loading: listLoading, refresh: refreshList } = useClaudeMdList(project.id);
  const [scope, setScope] = useState<ClaudeMdScope>('root');
  const { file, loading, error, refresh, save, remove } = useClaudeMdFile(
    project.id,
    scope,
    refreshList,
  );

  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    setBody(file.body);
    setErrorBanner(null);
  }, [file]);

  const dirty = useMemo(() => {
    if (!file) return false;
    return body !== file.body;
  }, [file, body]);

  const handleSave = async () => {
    if (!file) return;
    setErrorBanner(null);
    setSubmitting(true);
    const result = await save({ scope, body, mtimeAtRead: file.mtime });
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({
        code: result.code,
        message: result.message,
        showReload: result.code === 'conflict',
      });
    }
  };

  const handleDelete = async () => {
    if (!file || !file.exists) return;
    if (!window.confirm(t('confirmDelete', { path: file.path }))) return;
    setSubmitting(true);
    const result = await remove();
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({ code: result.code, message: result.message });
    }
  };

  const handleAddAgentsMdImport = () => {
    if (body.includes('@AGENTS.md')) return;
    const newBody = body.length === 0 ? '@AGENTS.md\n' : `@AGENTS.md\n\n${body}`;
    setBody(newBody);
  };

  if (listLoading || loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('loading')}</div>
    );
  }
  if (error || !file || !list) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="rounded-n-lg border border-n-border-default bg-n-surface px-7 py-7 text-center">
          <h3 className="text-[14px] font-semibold text-n-fg">{t('errorTitle')}</h3>
          {error && (
            <p className="mt-1 break-all font-n-mono text-[11.5px] text-n-muted">{error}</p>
          )}
          <button
            type="button"
            onClick={refresh}
            className="mt-4 rounded-n-sm border border-n-border-default bg-n-raised px-3 py-1.5 font-n-mono text-[11.5px] text-n-fg hover:bg-n-canvas"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  const hasAgentsMdImport = body.includes('@AGENTS.md');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-n-border-subtle px-7 py-5">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <FileText size={18} className="text-n-accent-strong" />
            {t('title')}
          </h1>
          <p className="m-0 mt-1 max-w-2xl text-pretty text-[13px] leading-relaxed text-n-muted">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {file.exists && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-[oklch(0.74_0.16_25_/_0.4)] bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-[oklch(0.50_0.16_25)] hover:bg-[oklch(0.74_0.16_25_/_0.08)] disabled:opacity-50"
            >
              <Trash2 size={12} /> {t('delete')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || submitting}
            className="inline-flex items-center gap-1.5 rounded-n-md border border-n-accent-line bg-n-accent-soft px-3 py-2 font-n-mono text-[12px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
          >
            <Save size={13} /> {t('save')}
          </button>
        </div>
      </header>

      {/* Scope tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-n-border-subtle bg-n-canvas px-7 py-2.5">
        {SCOPES.map((s) => {
          const summary = list.files.find((f) => f.scope === s);
          if (!summary) return null;
          return (
            <ScopeTab
              key={s}
              summary={summary}
              active={s === scope}
              onClick={() => setScope(s)}
            />
          );
        })}
      </div>

      {/* Path banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n-border-subtle bg-n-canvas px-7 py-2">
        <span className="break-all font-n-mono text-[11px] text-n-subtle" title={file.path}>
          {file.path}
        </span>
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
          {file.exists ? t(`badges.${scope}`) : t('badges.missing')}
        </span>
      </div>

      {/* Error banner */}
      {errorBanner && (
        <div className="mx-7 mt-4 flex items-start justify-between gap-3 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[oklch(0.55_0.16_25)]" />
            <div>
              <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-[oklch(0.55_0.16_25)]">
                {t(`errors.${errorBanner.code}Title`, { defaultValue: errorBanner.code })}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-n-fg">{errorBanner.message}</div>
            </div>
          </div>
          {errorBanner.showReload && (
            <button
              type="button"
              onClick={refresh}
              className="flex-shrink-0 rounded-n-sm border border-n-border-default bg-n-surface px-2 py-1 font-n-mono text-[11px] text-n-fg hover:bg-n-canvas"
            >
              {t('reload')}
            </button>
          )}
        </div>
      )}

      {/* Editor + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col gap-1.5 overflow-auto px-7 pb-8 pt-4">
          <div className="flex items-center justify-between">
            <label className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
              {t('bodyLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-transparent px-2 py-0.5 font-n-mono text-[10.5px] text-n-muted hover:bg-n-canvas"
            >
              <Eye size={11} /> {showPreview ? t('editBody') : t('previewBody')}
            </button>
          </div>
          {!showPreview ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('bodyPlaceholder')}
              className="min-h-[480px] flex-1 resize-none rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5 font-n-mono text-[12px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
            />
          ) : (
            <MarkdownViewer
              content={body}
              className="min-h-[480px] flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas"
            />
          )}
        </div>

        <Sidebar
          file={file}
          body={body}
          agentsMdAtRoot={list.agentsMdAtRoot}
          hasAgentsMdImport={hasAgentsMdImport}
          onAddAgentsMd={handleAddAgentsMdImport}
        />
      </div>
    </div>
  );
}

function ScopeTab({
  summary,
  active,
  onClick,
}: {
  summary: ClaudeMdSummary;
  active: boolean;
  onClick(): void;
}) {
  const { t } = useTranslation('claude-md');
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col items-start gap-0.5 rounded-n-md border px-3 py-2 transition-colors ' +
        (active
          ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
          : summary.exists
            ? 'border-n-border-subtle bg-n-surface text-n-fg hover:border-n-border-default'
            : 'border-dashed border-n-border-subtle bg-n-surface text-n-muted hover:border-n-border-default')
      }
    >
      <span className="font-n-mono text-[12px] font-semibold">{t(`tabs.${summary.scope}`)}</span>
      <span className="font-n-mono text-[10px] text-n-subtle">
        {summary.exists ? `${summary.lines} lines · ${summary.tokens} tok` : t('tabs.missing')}
      </span>
    </button>
  );
}

function Sidebar({
  file,
  body,
  agentsMdAtRoot,
  hasAgentsMdImport,
  onAddAgentsMd,
}: {
  file: import('@nakiros/shared').ClaudeMdFileContent;
  body: string;
  agentsMdAtRoot: boolean;
  hasAgentsMdImport: boolean;
  onAddAgentsMd(): void;
}) {
  const { t } = useTranslation('claude-md');
  const liveLines = body === '' ? 0 : body.split(/\r?\n/).length;
  const liveChars = body.length;
  const liveTokens = Math.round(liveChars / 4);
  const liveImports = useMemo(() => extractImports(body), [body]);
  const liveHasHtmlComments = useMemo(() => /<!--[\s\S]*?-->/m.test(body), [body]);
  const linesOver = liveLines > LINES_WARNING_THRESHOLD;
  const offerAgentsImport = file.scope === 'root' && agentsMdAtRoot && !hasAgentsMdImport;

  return (
    <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-auto border-l border-n-border-subtle bg-n-surface px-4 py-4 lg:flex">
      <Section title={t('sidebar.size')}>
        <div className="grid grid-cols-2 gap-2">
          <Kpi label={t('sidebar.lines')} value={liveLines} warn={linesOver} />
          <Kpi label={t('sidebar.tokens')} value={liveTokens} />
          <Kpi label={t('sidebar.chars')} value={liveChars} />
          <Kpi label={t('sidebar.sections')} value={file.headings.length} />
        </div>
        {linesOver && (
          <p className="mt-2 rounded-n-sm border border-[oklch(0.78_0.14_85_/_0.5)] bg-[oklch(0.92_0.10_85_/_0.18)] px-2 py-1.5 text-[11px] leading-snug text-[oklch(0.50_0.13_85)]">
            {t('sidebar.linesWarning', { threshold: LINES_WARNING_THRESHOLD })}
          </p>
        )}
      </Section>

      {file.headings.length > 0 && (
        <Section title={t('sidebar.headings')}>
          <div className="flex flex-col gap-1">
            {file.headings.map((h, i) => (
              <span
                key={`${h}-${i}`}
                className="truncate font-n-mono text-[11px] text-n-muted"
                title={h}
              >
                # {h}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('sidebar.imports')}>
        {liveImports.length === 0 ? (
          <p className="m-0 text-pretty text-[11.5px] text-n-muted">{t('sidebar.importsEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {liveImports.map((imp) => (
              <span
                key={imp}
                className="truncate rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-0.5 font-n-mono text-[11px] text-n-muted"
                title={`@${imp}`}
              >
                @{imp}
              </span>
            ))}
          </div>
        )}
        {offerAgentsImport && (
          <button
            type="button"
            onClick={onAddAgentsMd}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-n-sm border border-dashed border-n-accent-line bg-n-accent-soft px-2 py-1.5 font-n-mono text-[11px] text-n-accent-strong hover:bg-n-accent-soft/80"
          >
            <PlusCircle size={11} strokeWidth={2.5} /> {t('sidebar.importAgentsMd')}
          </button>
        )}
      </Section>

      {liveHasHtmlComments && (
        <Section title={t('sidebar.htmlComments')}>
          <p className="m-0 text-pretty text-[11.5px] leading-snug text-n-muted">
            {t('sidebar.htmlCommentsHelp')}
          </p>
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {title}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={
        'rounded-n-sm border bg-n-canvas px-2 py-1.5 ' +
        (warn ? 'border-[oklch(0.78_0.14_85_/_0.5)]' : 'border-n-border-subtle')
      }
    >
      <div className="font-n-mono text-[10px] uppercase tracking-[1px] text-n-subtle">{label}</div>
      <div
        className={
          'mt-0.5 font-n-mono text-[14px] font-semibold ' +
          (warn ? 'text-[oklch(0.50_0.13_85)]' : 'text-n-fg')
        }
      >
        {value}
      </div>
    </div>
  );
}

/** Mirrors the daemon's import extractor — keeps the sidebar live as the
 *  user edits without round-tripping through the backend. */
function extractImports(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let inCodeBlock = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s{0,3}```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const re = /@([A-Za-z0-9_./~-][\w./~@-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const path = m[1];
      if (path.includes('@')) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}
