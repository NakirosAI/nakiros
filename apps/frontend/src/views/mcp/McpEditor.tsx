import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, FilePen, Plus, Save, Trash2, X } from 'lucide-react';
import type {
  CreateMcpServerRequest,
  McpMutationResult,
  McpServerForEditor,
  McpTransport,
  SaveMcpServerRequest,
} from '@nakiros/shared';

interface BaseProps {
  projectId: string;
  onClose(saved: boolean): void;
  save(request: SaveMcpServerRequest): Promise<McpMutationResult>;
  create(request: CreateMcpServerRequest): Promise<McpMutationResult>;
  remove(name: string, mtimeAtRead: string): Promise<McpMutationResult>;
}

interface EditModeProps extends BaseProps {
  mode: 'edit';
  serverName: string;
}

interface CreateModeProps extends BaseProps {
  mode: 'create';
}

type McpEditorProps = EditModeProps | CreateModeProps;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TRANSPORTS: McpTransport[] = ['stdio', 'http', 'sse'];

/** Per-server editor for `.mcp.json`. Structured fields for the common
 *  case (stdio transport with command + args + env), URL + headers for
 *  HTTP/SSE, and a raw JSON box for anything beyond that. */
export default function McpEditor(props: McpEditorProps) {
  const { t } = useTranslation('mcp');
  const isCreate = props.mode === 'create';

  const [name, setName] = useState(isCreate ? '' : props.serverName);
  const [originalName, setOriginalName] = useState(isCreate ? '' : props.serverName);
  const [mtimeAtRead, setMtimeAtRead] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState<string[]>([]);
  const [argDraft, setArgDraft] = useState('');
  const [env, setEnv] = useState<Array<{ key: string; value: string }>>([]);
  const [url, setUrl] = useState('');
  const [headersJson, setHeadersJson] = useState('');
  const [restJson, setRestJson] = useState('');
  const [loading, setLoading] = useState(!isCreate);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  useEffect(() => {
    if (isCreate) return;
    const serverName = (props as EditModeProps).serverName;
    let cancelled = false;
    setLoading(true);
    window.nakiros
      .readClaudeMcpServer(props.projectId, serverName)
      .then((file: McpServerForEditor | null) => {
        if (cancelled) return;
        if (!file) {
          setErrorBanner({ code: 'not-found', message: t('editor.errors.notFound') });
          return;
        }
        setName(file.name);
        setOriginalName(file.name);
        setMtimeAtRead(file.mtimeAtRead);
        setTransport(file.transport);
        setCommand(file.command);
        setArgs(file.args);
        setEnv(file.env);
        setUrl(file.url);
        setHeadersJson(file.headersJson);
        setRestJson(file.restJson);
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
    const trimmedName = name.trim();
    if (!NAME_PATTERN.test(trimmedName)) {
      setErrorBanner({ code: 'invalid-name', message: t('editor.errors.invalidName') });
      return;
    }

    if (isCreate) {
      setSubmitting(true);
      const created = await props.create({
        name: trimmedName,
        transport,
        command,
        args,
        env,
        url,
      });
      setSubmitting(false);
      if (!created.ok) {
        setErrorBanner({ code: created.code, message: created.message });
        return;
      }
      // Apply headers / restJson via a follow-up save (create only takes the
      // common fields; a second save lets us set headers / opaque rest).
      if (headersJson.trim().length > 0 || restJson.trim().length > 0) {
        const saved = await props.save({
          name: trimmedName,
          transport,
          command,
          args,
          env,
          url,
          headersJson,
          restJson,
          mtimeAtRead: created.mtime,
        });
        if (!saved.ok) {
          setErrorBanner({
            code: saved.code,
            message: t('editor.errors.partialCreate', { error: saved.message }),
          });
          return;
        }
      }
      props.onClose(true);
      return;
    }

    setSubmitting(true);
    const result = await props.save({
      name: originalName,
      newName: trimmedName,
      transport,
      command,
      args,
      env,
      url,
      headersJson,
      restJson,
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
    const result = await props.remove(originalName, mtimeAtRead);
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
    const file = await window.nakiros.readClaudeMcpServer(props.projectId, originalName);
    if (file) {
      setMtimeAtRead(file.mtimeAtRead);
      setTransport(file.transport);
      setCommand(file.command);
      setArgs(file.args);
      setEnv(file.env);
      setUrl(file.url);
      setHeadersJson(file.headersJson);
      setRestJson(file.restJson);
    }
    setLoading(false);
  };

  const addArg = () => {
    const v = argDraft.trim();
    if (v.length === 0) return;
    setArgs([...args, v]);
    setArgDraft('');
  };

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('editor.loading')}</div>
    );
  }

  const isHttpLike = transport !== 'stdio';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
              {isCreate ? t('editor.titleCreate') : <span className="font-n-mono">{originalName}</span>}
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

      <div className="flex flex-1 flex-col gap-5 overflow-auto px-7 pb-8 pt-4">
        {/* Name */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editor.fields.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="github"
            className="w-full rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[13px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
          <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
            {t('editor.fields.nameHelp')}
          </div>
        </div>

        {/* Transport */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editor.fields.transport')}
          </label>
          <div className="inline-flex rounded-n-md border border-n-border-subtle bg-n-surface p-0.5">
            {TRANSPORTS.map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => setTransport(tr)}
                className={
                  'rounded-[5px] px-3 py-1 font-n-mono text-[11.5px] transition-colors ' +
                  (transport === tr
                    ? 'bg-n-accent-soft text-n-accent-strong'
                    : 'text-n-muted hover:text-n-fg')
                }
              >
                {tr}
              </button>
            ))}
          </div>
        </div>

        {/* stdio fields */}
        {!isHttpLike && (
          <>
            <div>
              <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editor.fields.command')}
              </label>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
                className="w-full rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editor.fields.args')}
              </label>
              <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
                {args.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {args.map((a, i) => (
                      <span
                        key={`${a}-${i}`}
                        className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-1.5 py-0.5 font-n-mono text-[11px] text-n-muted"
                      >
                        <span className="break-all">{a}</span>
                        <button
                          type="button"
                          onClick={() => setArgs(args.filter((_, idx) => idx !== i))}
                          aria-label="Remove"
                          className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10"
                        >
                          <X size={11} strokeWidth={2.5} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={argDraft}
                    onChange={(e) => setArgDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addArg();
                      }
                    }}
                    placeholder="-y @modelcontextprotocol/server-github"
                    className="flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addArg}
                    disabled={argDraft.trim().length === 0}
                    className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11px] text-n-muted hover:bg-n-canvas disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus size={11} strokeWidth={2.5} /> {t('editor.add')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* http / sse fields */}
        {isHttpLike && (
          <div>
            <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
              {t('editor.fields.url')}
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              className="w-full rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
            />
            <div className="mt-3">
              <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editor.fields.headers')}
              </label>
              <textarea
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder='{"Authorization": "Bearer ${TOKEN}"}'
                className="w-full resize-y rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[11.5px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
              <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
                {t('editor.fields.headersHelp')}
              </div>
            </div>
          </div>
        )}

        {/* Env (always shown) */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editor.fields.env')}
          </label>
          <EnvList env={env} onChange={setEnv} />
          <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
            {t('editor.fields.envHelp')}
          </div>
        </div>

        {/* Other (raw JSON) */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editor.fields.rest')}
          </label>
          <textarea
            value={restJson}
            onChange={(e) => setRestJson(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder='{"scopes": ["repo", "issue"]}'
            className="w-full resize-y rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[11.5px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
          <div className="mt-1 font-n-mono text-[10.5px] text-n-subtle">
            {t('editor.fields.restHelp')}
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvList({
  env,
  onChange,
}: {
  env: Array<{ key: string; value: string }>;
  onChange(next: Array<{ key: string; value: string }>): void;
}) {
  const { t } = useTranslation('mcp');
  const update = (i: number, patch: Partial<{ key: string; value: string }>) => {
    onChange(env.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const remove = (i: number) => onChange(env.filter((_, idx) => idx !== i));
  const add = () => onChange([...env, { key: '', value: '' }]);

  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      {env.length > 0 && (
        <div className="mb-2 flex flex-col gap-1.5">
          {env.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={row.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="GITHUB_TOKEN"
                className="w-44 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
              <input
                type="text"
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="${GITHUB_TOKEN}"
                className="flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove"
                className="inline-flex h-7 w-7 items-center justify-center rounded-n-sm border border-n-border-subtle bg-n-surface text-n-muted hover:bg-n-canvas"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 rounded-n-sm border border-dashed border-n-border-default bg-transparent px-2 py-1 font-n-mono text-[11px] text-n-muted hover:bg-n-surface"
      >
        <Plus size={11} strokeWidth={2.5} /> {t('editor.fields.envAdd')}
      </button>
    </div>
  );
}
