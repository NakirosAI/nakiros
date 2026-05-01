import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, Eye, FilePen, Save, Trash2 } from 'lucide-react';
import type {
  CreateOutputStyleRequest,
  OutputStyleFileContent,
  OutputStyleMutationResult,
  SaveOutputStyleRequest,
} from '@nakiros/shared';
import { MarkdownViewer } from '../../components/ui/MarkdownViewer';

interface BaseProps {
  projectId: string;
  onClose(saved: boolean): void;
  save(request: SaveOutputStyleRequest): Promise<OutputStyleMutationResult>;
  create(request: CreateOutputStyleRequest): Promise<OutputStyleMutationResult>;
  remove(name: string): Promise<OutputStyleMutationResult>;
}

interface EditModeProps extends BaseProps {
  mode: 'edit';
  styleName: string;
}

interface CreateModeProps extends BaseProps {
  mode: 'create';
}

type OutputStyleEditorProps = EditModeProps | CreateModeProps;

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Editor for `.claude/output-styles/<name>.md`. The frontmatter has only
 * two editable fields (`description`, `keep-coding-instructions`), so no
 * raw/structured toggle — everything is structured.
 */
export default function OutputStyleEditor(props: OutputStyleEditorProps) {
  const { t } = useTranslation('output-styles');
  const isCreate = props.mode === 'create';

  const [name, setName] = useState(isCreate ? '' : props.styleName);
  const [description, setDescription] = useState('');
  const [keepCoding, setKeepCoding] = useState(false);
  const [body, setBody] = useState('');
  const [mtimeAtRead, setMtimeAtRead] = useState('');
  const [loading, setLoading] = useState(!isCreate);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  useEffect(() => {
    if (isCreate) return;
    const styleName = (props as EditModeProps).styleName;
    let cancelled = false;
    setLoading(true);
    window.nakiros
      .readClaudeOutputStyle(props.projectId, styleName)
      .then((file: OutputStyleFileContent | null) => {
        if (cancelled) return;
        if (!file) {
          setErrorBanner({ code: 'not-found', message: t('editor.errors.notFound') });
          return;
        }
        setName(file.name);
        setDescription(file.description ?? '');
        setKeepCoding(file.keepCodingInstructions);
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
      setSubmitting(true);
      const created = await props.create({ name: trimmed, description });
      if (!created.ok) {
        setSubmitting(false);
        setErrorBanner({ code: created.code, message: created.message });
        return;
      }
      // Apply user's body / flags via a follow-up save when they differ from defaults.
      const needsSave =
        body.trim().length > 0 ||
        keepCoding !== false ||
        description.trim() !== (created.file.description ?? '').trim();
      if (needsSave) {
        const saved = await props.save({
          name: trimmed,
          description,
          keepCodingInstructions: keepCoding,
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
    const result = await props.save({
      name,
      description,
      keepCodingInstructions: keepCoding,
      body,
      mtimeAtRead,
    });
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
    const file = await window.nakiros.readClaudeOutputStyle(props.projectId, name);
    if (file) {
      setDescription(file.description ?? '');
      setKeepCoding(file.keepCodingInstructions);
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

        {/* Description */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editor.descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('editor.descriptionPlaceholder')}
            rows={2}
            className="w-full resize-y rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 text-[13px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
          <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
            {t('editor.descriptionHelp')}
          </div>
        </div>

        {/* Keep coding instructions */}
        <label className="flex cursor-pointer items-start gap-3 rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5 hover:border-n-border-default">
          <input
            type="checkbox"
            checked={keepCoding}
            onChange={(e) => setKeepCoding(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-n-accent-strong"
          />
          <div>
            <div className="font-n-mono text-[12px] font-semibold text-n-fg">
              {t('editor.keepCodingLabel')}
            </div>
            <div className="mt-0.5 text-pretty text-[11.5px] leading-relaxed text-n-muted">
              {t('editor.keepCodingHelp')}
            </div>
          </div>
        </label>

        {/* Body */}
        <div className="flex flex-1 flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
              {t('editor.bodyLabel')}
            </label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-transparent px-2 py-0.5 font-n-mono text-[10.5px] text-n-muted hover:bg-n-canvas"
            >
              <Eye size={11} /> {showPreview ? t('editor.editBody') : t('editor.previewBody')}
            </button>
          </div>
          {!showPreview ? (
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
