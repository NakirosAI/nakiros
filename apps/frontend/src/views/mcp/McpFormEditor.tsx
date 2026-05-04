import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type McpTransport = 'stdio' | 'http' | 'sse';

interface McpServerEntry {
  name: string;
  type: McpTransport;
  url: string;
  command: string;
  args: string[];
  env: Array<{ key: string; value: string }>;
  headers: Array<{ key: string; value: string }>;
  alwaysLoad: boolean;
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

function parseServersFromJson(value: string): McpServerEntry[] | null {
  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(value) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    parsed = raw as Record<string, unknown>;
  } catch {
    return null;
  }

  const mcpServers = parsed['mcpServers'];
  if (typeof mcpServers !== 'object' || mcpServers === null || Array.isArray(mcpServers)) {
    // Empty object or missing key — return empty list (not null, still valid)
    return [];
  }

  const entries: McpServerEntry[] = [];
  for (const [name, raw] of Object.entries(mcpServers as Record<string, unknown>)) {
    const srv = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

    // transport: accept both `type` and `transport` keys for compatibility
    const rawType =
      typeof srv['type'] === 'string'
        ? srv['type']
        : typeof srv['transport'] === 'string'
          ? srv['transport']
          : 'stdio';
    const type: McpTransport =
      rawType === 'http' || rawType === 'sse' ? rawType : 'stdio';

    const url = typeof srv['url'] === 'string' ? srv['url'] : '';
    const command = typeof srv['command'] === 'string' ? srv['command'] : '';
    const args = Array.isArray(srv['args'])
      ? (srv['args'] as unknown[]).filter((a): a is string => typeof a === 'string')
      : [];

    // env — can be object or array-of-pairs
    let env: Array<{ key: string; value: string }> = [];
    const rawEnv = srv['env'];
    if (typeof rawEnv === 'object' && rawEnv !== null && !Array.isArray(rawEnv)) {
      env = Object.entries(rawEnv as Record<string, unknown>).map(([k, v]) => ({
        key: k,
        value: String(v ?? ''),
      }));
    }

    // headers — same shape
    let headers: Array<{ key: string; value: string }> = [];
    const rawHeaders = srv['headers'];
    if (typeof rawHeaders === 'object' && rawHeaders !== null && !Array.isArray(rawHeaders)) {
      headers = Object.entries(rawHeaders as Record<string, unknown>).map(([k, v]) => ({
        key: k,
        value: String(v ?? ''),
      }));
    }

    const alwaysLoad = srv['alwaysLoad'] === true;

    entries.push({ name, type, url, command, args, env, headers, alwaysLoad });
  }
  return entries;
}

function serializeServersTosJson(servers: McpServerEntry[]): string {
  const mcpServers: Record<string, unknown> = {};
  for (const srv of servers) {
    const obj: Record<string, unknown> = { type: srv.type };
    if (srv.type === 'stdio') {
      if (srv.command.trim()) obj['command'] = srv.command.trim();
      if (srv.args.length > 0) obj['args'] = srv.args;
    } else {
      if (srv.url.trim()) obj['url'] = srv.url.trim();
      if (srv.headers.length > 0) {
        const h: Record<string, string> = {};
        for (const { key, value } of srv.headers) {
          if (key.trim()) h[key.trim()] = value;
        }
        if (Object.keys(h).length > 0) obj['headers'] = h;
      }
    }
    if (srv.env.length > 0) {
      const e: Record<string, string> = {};
      for (const { key, value } of srv.env) {
        if (key.trim()) e[key.trim()] = value;
      }
      if (Object.keys(e).length > 0) obj['env'] = e;
    }
    if (srv.alwaysLoad) obj['alwaysLoad'] = true;
    mcpServers[srv.name] = obj;
  }
  return JSON.stringify({ mcpServers }, null, 2);
}

// ── Public interface ───────────────────────────────────────────────────────────

export interface McpFormEditorProps {
  /** Complete `.mcp.json` content as a JSON string. */
  value: string;
  /** Change handler — called with the updated JSON string after each form interaction. */
  onChange: (next: string) => void;
}

/**
 * Visual form editor for the project-root `.mcp.json` file.
 *
 * Displays one card per MCP server with transport-specific fields
 * (stdio: command + args; http/sse: url + headers) plus shared env
 * key-value pairs, alwaysLoad toggle, and add/remove controls.
 *
 * When `value` is not parseable JSON, renders a fallback message so the
 * user knows they must switch to JSON view to fix the syntax first.
 *
 * Uses the `mcp-runner` i18n namespace for labels and messages.
 */
export default function McpFormEditor({ value, onChange }: McpFormEditorProps) {
  const { t } = useTranslation('mcp-runner');

  const servers = useMemo(() => parseServersFromJson(value), [value]);

  if (servers === null) {
    return (
      <div className="flex items-center gap-2 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-3">
        <AlertTriangle size={14} className="flex-shrink-0 text-[oklch(0.55_0.16_25)]" />
        <span className="font-n-mono text-[12px] text-[oklch(0.50_0.16_25)]">
          {t('editTab.formCannotRenderInvalid')}
        </span>
      </div>
    );
  }

  const updateServer = (idx: number, patch: Partial<McpServerEntry>) => {
    const updated = servers.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(serializeServersTosJson(updated));
  };

  const removeServer = (idx: number) => {
    onChange(serializeServersTosJson(servers.filter((_, i) => i !== idx)));
  };

  const addServer = () => {
    const next: McpServerEntry = {
      name: `server-${servers.length + 1}`,
      type: 'stdio',
      url: '',
      command: '',
      args: [],
      env: [],
      headers: [],
      alwaysLoad: false,
    };
    onChange(serializeServersTosJson([...servers, next]));
  };

  return (
    <div className="flex flex-col gap-3">
      {servers.map((srv, idx) => (
        <ServerCard
          key={`${srv.name}-${idx}`}
          server={srv}
          onChange={(patch) => updateServer(idx, patch)}
          onRemove={() => removeServer(idx)}
          t={t}
        />
      ))}
      <button
        type="button"
        onClick={addServer}
        className="inline-flex items-center gap-1.5 self-start rounded-n-sm border border-dashed border-n-border-default bg-transparent px-3 py-1.5 font-n-mono text-[11.5px] text-n-muted hover:bg-n-surface"
      >
        <Plus size={12} strokeWidth={2.5} />
        {t('editTab.addServer')}
      </button>
    </div>
  );
}

// ── Server card ───────────────────────────────────────────────────────────────

function ServerCard({
  server,
  onChange,
  onRemove,
  t,
}: {
  server: McpServerEntry;
  onChange(patch: Partial<McpServerEntry>): void;
  onRemove(): void;
  t: (key: string) => string;
}) {
  const TRANSPORTS: McpTransport[] = ['stdio', 'http', 'sse'];

  const updateArg = (i: number, val: string) => {
    const next = server.args.map((a, idx) => (idx === i ? val : a));
    onChange({ args: next });
  };
  const removeArg = (i: number) => onChange({ args: server.args.filter((_, idx) => idx !== i) });
  const addArg = () => onChange({ args: [...server.args, ''] });

  const updateEnvRow = (i: number, patch: Partial<{ key: string; value: string }>) => {
    onChange({ env: server.env.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  };
  const removeEnvRow = (i: number) => onChange({ env: server.env.filter((_, idx) => idx !== i) });
  const addEnvRow = () => onChange({ env: [...server.env, { key: '', value: '' }] });

  const updateHeaderRow = (i: number, patch: Partial<{ key: string; value: string }>) => {
    onChange({ headers: server.headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  };
  const removeHeaderRow = (i: number) =>
    onChange({ headers: server.headers.filter((_, idx) => idx !== i) });
  const addHeaderRow = () => onChange({ headers: [...server.headers, { key: '', value: '' }] });

  return (
    <section className="rounded-n-lg border border-n-border-default bg-n-surface">
      {/* Card header */}
      <header className="flex items-center justify-between gap-3 border-b border-n-border-subtle px-4 py-3">
        <div className="flex flex-1 items-center gap-3">
          {/* Server name input */}
          <input
            type="text"
            value={server.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t('editTab.serverName')}
            className="w-44 rounded-n-sm border border-n-border-subtle bg-n-canvas px-2 py-1 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
          {/* Transport toggle */}
          <div className="inline-flex rounded-n-md border border-n-border-subtle bg-n-canvas p-0.5">
            {TRANSPORTS.map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => onChange({ type: tr })}
                className={
                  'rounded-[5px] px-2 py-0.5 font-n-mono text-[11px] transition-colors ' +
                  (server.type === tr
                    ? 'bg-n-accent-soft text-n-accent-strong'
                    : 'text-n-muted hover:text-n-fg')
                }
              >
                {tr}
              </button>
            ))}
          </div>
          {/* alwaysLoad toggle */}
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-n-mono text-[11px] text-n-muted">
            <input
              type="checkbox"
              checked={server.alwaysLoad}
              onChange={(e) => onChange({ alwaysLoad: e.target.checked })}
              className="rounded accent-[oklch(var(--n-accent))]"
            />
            {t('editTab.alwaysLoad')}
          </label>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('editTab.removeServer')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-n-sm border border-n-border-subtle bg-n-surface text-n-muted hover:bg-n-canvas hover:text-[oklch(0.50_0.16_25)]"
        >
          <Trash2 size={12} />
        </button>
      </header>

      {/* Card body */}
      <div className="flex flex-col gap-3 px-4 py-3">
        {server.type === 'stdio' ? (
          <>
            {/* Command */}
            <div>
              <label className="mb-1 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editTab.command')}
              </label>
              <input
                type="text"
                value={server.command}
                onChange={(e) => onChange({ command: e.target.value })}
                placeholder="npx"
                className="w-full rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-1.5 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
            </div>
            {/* Args */}
            <div>
              <label className="mb-1 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editTab.args')}
              </label>
              <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-2">
                {server.args.length > 0 && (
                  <div className="mb-2 flex flex-col gap-1">
                    {server.args.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={a}
                          onChange={(e) => updateArg(i, e.target.value)}
                          className="flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeArg(i)}
                          aria-label="Remove arg"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-n-sm border border-n-border-subtle bg-n-surface text-n-muted hover:bg-n-canvas"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addArg}
                  className="inline-flex items-center gap-1 rounded-n-sm border border-dashed border-n-border-default bg-transparent px-2 py-0.5 font-n-mono text-[11px] text-n-muted hover:bg-n-surface"
                >
                  <Plus size={10} strokeWidth={2.5} /> add arg
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* URL */}
            <div>
              <label className="mb-1 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editTab.url')}
              </label>
              <input
                type="text"
                value={server.url}
                onChange={(e) => onChange({ url: e.target.value })}
                placeholder="https://example.com/mcp"
                className="w-full rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-1.5 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
            </div>
            {/* Headers */}
            <div>
              <label className="mb-1 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                {t('editTab.headers')}
              </label>
              <KeyValueList rows={server.headers} onUpdate={updateHeaderRow} onRemove={removeHeaderRow} onAdd={addHeaderRow} />
            </div>
          </>
        )}

        {/* Env (always shown) */}
        <div>
          <label className="mb-1 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('editTab.env')}
          </label>
          <KeyValueList rows={server.env} onUpdate={updateEnvRow} onRemove={removeEnvRow} onAdd={addEnvRow} />
        </div>
      </div>
    </section>
  );
}

// ── Key-value list (env / headers) ─────────────────────────────────────────────

function KeyValueList({
  rows,
  onUpdate,
  onRemove,
  onAdd,
}: {
  rows: Array<{ key: string; value: string }>;
  onUpdate(i: number, patch: Partial<{ key: string; value: string }>): void;
  onRemove(i: number): void;
  onAdd(): void;
}) {
  return (
    <div className="rounded-n-sm border border-n-border-subtle bg-n-canvas px-2.5 py-2">
      {rows.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={row.key}
                onChange={(e) => onUpdate(i, { key: e.target.value })}
                placeholder="KEY"
                className="w-36 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
              <input
                type="text"
                value={row.value}
                onChange={(e) => onUpdate(i, { value: e.target.value })}
                placeholder="${VALUE}"
                className="flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove"
                className="inline-flex h-7 w-7 items-center justify-center rounded-n-sm border border-n-border-subtle bg-n-surface text-n-muted hover:bg-n-canvas"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-n-sm border border-dashed border-n-border-default bg-transparent px-2 py-0.5 font-n-mono text-[11px] text-n-muted hover:bg-n-surface"
      >
        <Plus size={10} strokeWidth={2.5} /> add
      </button>
    </div>
  );
}
