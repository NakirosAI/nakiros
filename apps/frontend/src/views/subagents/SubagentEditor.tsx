import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Eye, FilePen, Save, Trash2 } from 'lucide-react';
import { parseDocument, type Document } from 'yaml';
import type {
  AgentFileContent,
  AgentMutationResult,
  CreateAgentRequest,
  SaveAgentRequest,
} from '@nakiros/shared';
import { MarkdownViewer } from '../../components/ui/MarkdownViewer';

interface BaseProps {
  projectId: string;
  onClose(saved: boolean): void;
  save(request: SaveAgentRequest): Promise<AgentMutationResult>;
  create(request: CreateAgentRequest): Promise<AgentMutationResult>;
  remove(name: string): Promise<AgentMutationResult>;
}

interface EditModeProps extends BaseProps {
  mode: 'edit';
  agentName: string;
}

interface CreateModeProps extends BaseProps {
  mode: 'create';
}

type SubagentEditorProps = EditModeProps | CreateModeProps;

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const TOOLS_PRESET = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'Agent',
  'TodoWrite',
  'AskUserQuestion',
];
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as const;
const STANDARD_MODELS = ['inherit', 'sonnet', 'opus', 'haiku'] as const;

/**
 * Subagent editor. Owns the full file content (frontmatter raw string + body)
 * as the source of truth. Two views over the frontmatter:
 *
 * - **Structured** (default): controls for the essentials — `description`,
 *   `model`, `tools`, `color`. Each control reads/writes the YAML Document
 *   under the hood, so unrelated fields (memory, hooks, mcpServers, …)
 *   survive structured edits.
 * - **Raw**: textarea showing the full frontmatter as YAML; useful for the
 *   advanced fields the structured view doesn't surface.
 *
 * Switching tabs always syncs from `frontmatterRaw`, so they stay aligned.
 */
export default function SubagentEditor(props: SubagentEditorProps) {
  const { t } = useTranslation('subagents');
  const isCreate = props.mode === 'create';

  const [name, setName] = useState(isCreate ? '' : props.agentName);
  const [frontmatterRaw, setFrontmatterRaw] = useState('');
  const [body, setBody] = useState('');
  const [mtimeAtRead, setMtimeAtRead] = useState('');
  const [loading, setLoading] = useState(!isCreate);
  const [submitting, setSubmitting] = useState(false);
  const [fmMode, setFmMode] = useState<'structured' | 'raw'>('structured');
  const [showBodyPreview, setShowBodyPreview] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  // Edit mode: fetch on mount.
  useEffect(() => {
    if (isCreate) return;
    const agentName = (props as EditModeProps).agentName;
    let cancelled = false;
    setLoading(true);
    window.nakiros
      .readClaudeAgent(props.projectId, agentName)
      .then((file: AgentFileContent | null) => {
        if (cancelled) return;
        if (!file) {
          setErrorBanner({ code: 'not-found', message: t('editor.errors.notFound') });
          return;
        }
        setName(file.name);
        setFrontmatterRaw(file.frontmatterRaw);
        setBody(file.body);
        setMtimeAtRead(file.mtime);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorBanner({
          code: 'read-failed',
          message: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCreate, props, t]);

  const handleSubmit = async () => {
    setErrorBanner(null);

    if (isCreate) {
      const trimmed = name.trim();
      if (!NAME_PATTERN.test(trimmed)) {
        setErrorBanner({ code: 'invalid-name', message: t('editor.errors.invalidName') });
        return;
      }
      const description = readField(frontmatterRaw, 'description') ?? '';
      setSubmitting(true);
      const created = await props.create({
        name: trimmed,
        description: typeof description === 'string' ? description : undefined,
      });
      if (!created.ok) {
        setSubmitting(false);
        setErrorBanner({ code: created.code, message: created.message });
        return;
      }
      // Subsequent save to apply the user's frontmatter + body if non-default.
      if (frontmatterRaw.trim().length > 0 || body.trim().length > 0) {
        const saved = await props.save({
          name: trimmed,
          frontmatterRaw: frontmatterRaw.trim().length > 0 ? frontmatterRaw : created.file.frontmatterRaw,
          body: body.length > 0 ? body : created.file.body,
          mtimeAtRead: created.file.mtime,
        });
        setSubmitting(false);
        if (!saved.ok) {
          setErrorBanner({
            code: saved.code,
            message: t('editor.errors.partialCreate', { error: saved.message }),
          });
          return;
        }
      } else {
        setSubmitting(false);
      }
      props.onClose(true);
      return;
    }

    setSubmitting(true);
    const result = await props.save({ name, frontmatterRaw, body, mtimeAtRead });
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({
        code: result.code,
        message: result.message,
        showReload: result.code === 'conflict',
      });
      return;
    }
    props.onClose(true);
  };

  const handleDelete = async () => {
    if (isCreate) return;
    if (!window.confirm(t('editor.confirmDelete', { name }))) return;
    setSubmitting(true);
    const result = await props.remove(name);
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({ code: result.code, message: result.message });
      return;
    }
    props.onClose(true);
  };

  const handleReloadAfterConflict = async () => {
    if (isCreate) return;
    setLoading(true);
    setErrorBanner(null);
    const file = await window.nakiros.readClaudeAgent(props.projectId, name);
    if (file) {
      setFrontmatterRaw(file.frontmatterRaw);
      setBody(file.body);
      setMtimeAtRead(file.mtime);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('editor.loading')}</div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n-border-subtle px-7 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => props.onClose(false)}
            className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-transparent px-2 py-1 font-n-mono text-[11.5px] text-n-muted hover:bg-n-canvas"
          >
            <ArrowLeft size={12} /> {t('editor.back')}
          </button>
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[18px] font-semibold tracking-tight">
              <FilePen size={16} className="text-n-accent-strong" />
              {isCreate ? t('editor.titleCreate') : <span className="font-n-mono">{name}</span>}
            </h1>
            <div className="mt-0.5 text-[12px] text-n-muted">
              {isCreate ? t('editor.subtitleCreate') : t('editor.subtitleEdit')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCreate && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-n-sm border border-[oklch(0.74_0.16_25_/_0.4)] bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-[oklch(0.50_0.16_25)] hover:bg-[oklch(0.74_0.16_25_/_0.08)] disabled:opacity-50"
            >
              <Trash2 size={12} /> {t('editor.delete')}
            </button>
          )}
          <button
            type="button"
            onClick={() => props.onClose(false)}
            disabled={submitting}
            className="rounded-n-sm border border-n-border-subtle bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:bg-n-canvas disabled:opacity-50"
          >
            {t('editor.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80 disabled:opacity-50"
          >
            <Save size={12} /> {isCreate ? t('editor.create') : t('editor.save')}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {errorBanner && (
        <div className="mx-7 mt-4 flex items-start justify-between gap-3 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[oklch(0.55_0.16_25)]" />
            <div>
              <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-[oklch(0.55_0.16_25)]">
                {t(`editor.errors.${errorBanner.code}Title`, { defaultValue: errorBanner.code })}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-n-fg">{errorBanner.message}</div>
            </div>
          </div>
          {errorBanner.showReload && (
            <button
              type="button"
              onClick={handleReloadAfterConflict}
              className="flex-shrink-0 rounded-n-sm border border-n-border-default bg-n-surface px-2 py-1 font-n-mono text-[11px] text-n-fg hover:bg-n-canvas"
            >
              {t('editor.reload')}
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 flex-col gap-5 overflow-auto px-7 pb-8 pt-4">
        {/* Name (create only) */}
        {isCreate && (
          <div>
            <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
              {t('editor.nameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('editor.namePlaceholder')}
              className="w-full rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[13px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
            />
            <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">{t('editor.nameHelp')}</div>
          </div>
        )}

        {/* Frontmatter mode toggle */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
              {t('editor.frontmatterLabel')}
            </label>
            <div className="inline-flex rounded-n-sm border border-n-border-subtle bg-n-surface p-0.5">
              <button
                type="button"
                onClick={() => setFmMode('structured')}
                className={
                  'rounded-[3px] px-2 py-0.5 font-n-mono text-[10.5px] transition-colors ' +
                  (fmMode === 'structured'
                    ? 'bg-n-accent-soft text-n-accent-strong'
                    : 'text-n-muted hover:text-n-fg')
                }
              >
                {t('editor.structured')}
              </button>
              <button
                type="button"
                onClick={() => setFmMode('raw')}
                className={
                  'rounded-[3px] px-2 py-0.5 font-n-mono text-[10.5px] transition-colors ' +
                  (fmMode === 'raw'
                    ? 'bg-n-accent-soft text-n-accent-strong'
                    : 'text-n-muted hover:text-n-fg')
                }
              >
                {t('editor.raw')}
              </button>
            </div>
          </div>
          {fmMode === 'structured' ? (
            <StructuredFrontmatter
              frontmatterRaw={frontmatterRaw}
              onChange={setFrontmatterRaw}
            />
          ) : (
            <RawFrontmatter frontmatterRaw={frontmatterRaw} onChange={setFrontmatterRaw} />
          )}
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
              {t('editor.bodyLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowBodyPreview((v) => !v)}
              className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-transparent px-2 py-0.5 font-n-mono text-[10.5px] text-n-muted hover:bg-n-canvas"
            >
              <Eye size={11} /> {showBodyPreview ? t('editor.editBody') : t('editor.previewBody')}
            </button>
          </div>
          {!showBodyPreview ? (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('editor.bodyPlaceholder')}
              className="min-h-[260px] flex-1 resize-none rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5 font-n-mono text-[12px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
            />
          ) : (
            <MarkdownViewer
              content={body}
              className="min-h-[260px] flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Structured frontmatter editor ─────────────────────────────────────────-
function StructuredFrontmatter({
  frontmatterRaw,
  onChange,
}: {
  frontmatterRaw: string;
  onChange(next: string): void;
}) {
  const { t } = useTranslation('subagents');
  const doc = useMemo<Document.Parsed | null>(() => {
    try {
      return parseDocument(frontmatterRaw === '' ? '{}' : frontmatterRaw);
    } catch {
      return null;
    }
  }, [frontmatterRaw]);

  if (!doc || doc.errors.length > 0) {
    return (
      <div className="rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2.5 text-[12px] text-n-fg">
        {t('editor.cantParseStructured')}
      </div>
    );
  }

  const description = stringFromDoc(doc, 'description');
  const model = stringFromDoc(doc, 'model');
  const color = stringFromDoc(doc, 'color');
  const tools = arrayFromDoc(doc, 'tools');

  const updateField = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      doc.delete(key);
    } else {
      doc.set(key, value);
    }
    onChange(doc.toString());
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Description */}
      <FieldRow label={t('editor.fields.description')}>
        <textarea
          value={description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={2}
          placeholder={t('editor.fields.descriptionPlaceholder')}
          className="w-full resize-y rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 text-[13px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
        <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">{t('editor.fields.descriptionHelp')}</div>
      </FieldRow>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Model */}
        <FieldRow label={t('editor.fields.model')}>
          <ModelPicker value={model} onChange={(v) => updateField('model', v)} />
        </FieldRow>
        {/* Color */}
        <FieldRow label={t('editor.fields.color')}>
          <ColorPicker value={color} onChange={(v) => updateField('color', v)} />
        </FieldRow>
      </div>

      {/* Tools */}
      <FieldRow label={t('editor.fields.tools')}>
        <ToolsPicker value={tools} onChange={(v) => updateField('tools', v)} />
        <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">{t('editor.fields.toolsHelp')}</div>
      </FieldRow>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModelPicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { t } = useTranslation('subagents');
  const known = new Set<string>(STANDARD_MODELS);
  const [isCustom, setIsCustom] = useState(value !== '' && !known.has(value));

  const selected = isCustom ? '__custom__' : value === '' ? 'inherit' : value;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom__') {
            setIsCustom(true);
            return;
          }
          setIsCustom(false);
          onChange(v === 'inherit' ? '' : v);
        }}
        className="flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] text-n-fg focus:border-n-accent-line focus:outline-none"
      >
        {STANDARD_MODELS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        <option value="__custom__">{t('editor.fields.modelCustom')}</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="claude-opus-4-7"
          className="flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
      )}
    </div>
  );
}

const COLOR_SWATCH: Record<(typeof COLORS)[number], string> = {
  red: 'oklch(0.66 0.20 25)',
  blue: 'oklch(0.66 0.16 245)',
  green: 'oklch(0.70 0.16 145)',
  yellow: 'oklch(0.85 0.16 95)',
  purple: 'oklch(0.62 0.18 295)',
  orange: 'oklch(0.72 0.17 55)',
  pink: 'oklch(0.72 0.18 350)',
  cyan: 'oklch(0.74 0.13 195)',
};

function ColorPicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const { t } = useTranslation('subagents');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label={t('editor.fields.colorNone')}
        title={t('editor.fields.colorNone')}
        className={
          'relative flex h-7 w-7 items-center justify-center rounded-full border transition-all ' +
          (value === ''
            ? 'border-n-accent-line ring-2 ring-n-accent-line/40'
            : 'border-n-border-subtle hover:border-n-border-default')
        }
      >
        <span className="block h-3 w-3 rotate-45 border-t border-n-faint" />
      </button>
      {COLORS.map((c) => {
        const selected = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            aria-pressed={selected}
            title={c}
            style={{ background: COLOR_SWATCH[c] }}
            className={
              'h-7 w-7 rounded-full border-2 transition-all ' +
              (selected
                ? 'border-n-fg ring-2 ring-n-accent-line/40'
                : 'border-transparent hover:scale-110')
            }
          />
        );
      })}
      <span className="ml-1 font-n-mono text-[10.5px] text-n-subtle">
        {value === '' ? t('editor.fields.colorNone') : value}
      </span>
    </div>
  );
}

function ToolsPicker({ value, onChange }: { value: string[]; onChange(v: string[]): void }) {
  const known = new Set(value);
  const extras = value.filter((v) => !TOOLS_PRESET.includes(v));
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      <div className="flex flex-wrap gap-1.5">
        {TOOLS_PRESET.map((tool) => {
          const checked = known.has(tool);
          return (
            <button
              key={tool}
              type="button"
              onClick={() => {
                if (checked) onChange(value.filter((v) => v !== tool));
                else onChange([...value, tool]);
              }}
              className={
                'rounded-n-sm border px-1.5 py-0.5 font-n-mono text-[11px] transition-colors ' +
                (checked
                  ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                  : 'border-n-border-subtle bg-n-surface text-n-muted hover:bg-n-raised')
              }
            >
              {tool}
            </button>
          );
        })}
      </div>
      {extras.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-n-mono text-[10px] uppercase tracking-[0.7px] text-n-subtle">extra</span>
          {extras.map((tool) => (
            <span
              key={tool}
              className="rounded-n-sm border border-n-border-subtle bg-n-surface px-1.5 py-0.5 font-n-mono text-[11px] text-n-muted"
            >
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Raw frontmatter editor ────────────────────────────────────────────────-
function RawFrontmatter({
  frontmatterRaw,
  onChange,
}: {
  frontmatterRaw: string;
  onChange(next: string): void;
}) {
  return (
    <textarea
      value={frontmatterRaw}
      onChange={(e) => onChange(e.target.value)}
      rows={10}
      spellCheck={false}
      className="w-full resize-y rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
      placeholder={'name: my-agent\ndescription: …\nmodel: sonnet\ntools:\n  - Read\n  - Grep'}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────-
function stringFromDoc(doc: Document.Parsed, key: string): string {
  const v = doc.get(key);
  return typeof v === 'string' ? v : '';
}

function arrayFromDoc(doc: Document.Parsed, key: string): string[] {
  const v = doc.get(key);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  // yaml's Document returns YAMLSeq instances which behave as iterables
  if (v && typeof v === 'object' && 'items' in v) {
    const items = (v as { items: unknown[] }).items;
    return items
      .map((it) => (it && typeof it === 'object' && 'value' in it ? (it as { value: unknown }).value : it))
      .filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/** Read a top-level scalar field from a frontmatter string without going
 *  through the full Document API. Used by the create flow to seed the
 *  description into the initial file. */
function readField(frontmatterRaw: string, key: string): string | null {
  try {
    const doc = parseDocument(frontmatterRaw);
    const v = doc.get(key);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}
