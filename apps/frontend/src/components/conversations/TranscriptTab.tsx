import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type {
  ConversationAnalysis,
  ConversationMessage,
} from '@nakiros/shared';
import { useConversationMessages } from '../../hooks/useConversationMessages';
import { LoadingState } from '../ui';

interface Props {
  analysis: ConversationAnalysis;
}

type RoleFilter = 'all' | 'user' | 'assistant' | 'system';

const ROLES: RoleFilter[] = ['all', 'user', 'assistant', 'system'];

/**
 * Transcript tab — pretty-prints each `ConversationMessage` as a collapsible
 * JSON record with role-aware coloring and full-text search. We don't read
 * the JSONL file directly — `ConversationMessage` is the normalized shape
 * the analyzer builds — so the rendered JSON is the parsed view, not the
 * raw file. That's enough for inspection in PR10b.
 */
export function TranscriptTab({ analysis }: Props) {
  const { t } = useTranslation('conversations');
  const messages = useConversationMessages(analysis.projectId, analysis.sessionId);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');

  const filtered = useMemo(() => {
    if (!messages) return null;
    const needle = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (role !== 'all' && m.type !== role) return false;
      if (!needle) return true;
      return JSON.stringify(m).toLowerCase().includes(needle);
    });
  }, [messages, search, role]);

  if (filtered === null) {
    return <LoadingState>{t('loadingMessages')}</LoadingState>;
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-1.5 rounded-n-md border border-n-border-default bg-n-surface px-2.5 py-1.5">
          <Search size={13} className="text-n-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('transcript.searchPlaceholder')}
            className="flex-1 bg-transparent font-n-mono text-[12px] text-n-fg outline-none placeholder:text-n-faint"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="font-n-mono text-[14px] text-n-faint hover:text-n-muted"
              aria-label={t('transcript.clearSearch')}
            >
              ×
            </button>
          )}
        </label>
        {ROLES.map((r) => {
          const active = r === role;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={
                'rounded-full border px-2.5 py-1 font-n-mono text-[10.5px] transition-colors ' +
                (active
                  ? 'border-n-accent bg-n-accent-soft text-n-accent-strong'
                  : 'border-n-border-default text-n-muted hover:text-n-fg')
              }
            >
              {r}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-n-sm bg-n-sunken px-3 py-1.5 font-n-mono text-[11px]">
        <span className="text-n-muted">
          <span className="text-n-fg">{filtered.length}</span> {t('transcript.records')}
          <span className="text-n-faint"> / {messages?.length ?? 0}</span>
          <span className="ml-2 text-n-faint">session</span>{' '}
          <span className="text-n-accent">{analysis.sessionId.slice(0, 12)}</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-n-md border border-n-border-subtle bg-n-sunken px-4 py-6 text-center font-n-mono text-[11.5px] text-n-faint">
          {t('transcript.empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-n-md border border-n-border-subtle bg-n-sunken font-n-mono text-[11.5px] leading-relaxed">
          {filtered.map((m, idx) => (
            <JsonRecord key={m.uuid} message={m} lineNo={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function JsonRecord({ message, lineNo }: { message: ConversationMessage; lineNo: number }) {
  const [open, setOpen] = useState(lineNo <= 3);
  const typeColor =
    message.type === 'user'
      ? 'text-n-accent'
      : message.type === 'assistant'
        ? 'text-n-track-tokens'
        : 'text-n-info';

  const preview = previewOf(message);
  const time = formatTime(message.timestamp);

  return (
    <div className="border-b border-n-border-subtle/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ' +
          (open ? 'bg-n-surface' : 'hover:bg-n-raised/40')
        }
      >
        <span className="w-7 flex-shrink-0 select-none text-right text-n-faint">{lineNo}</span>
        <span className="text-n-faint">{open ? '▾' : '▸'}</span>
        <span className={'min-w-[78px] ' + typeColor}>{message.type}</span>
        <span className="min-w-[64px] text-n-faint">{time}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-n-muted">{preview}</span>
        {message.isSidechain && (
          <span className="text-[10px] text-n-violet">sidechain</span>
        )}
      </button>
      {open && (
        <pre className="m-0 whitespace-pre-wrap break-words px-12 pb-3 pt-1 text-[11.2px] leading-relaxed text-n-muted">
          {syntaxHighlight(message)}
        </pre>
      )}
    </div>
  );
}

function previewOf(m: ConversationMessage): string {
  if (m.toolUse && m.toolUse.length > 0) {
    return `${m.toolUse.length} tool use · ${m.toolUse.map((t) => t.name).join(', ')}`;
  }
  if (m.content) {
    const flat = m.content.replace(/\s+/g, ' ').trim();
    return flat.length > 160 ? flat.slice(0, 160) + '…' : flat;
  }
  return '';
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Lightweight JSON syntax highlighter: keys (accent), strings (healthy),
 * numbers (watch), booleans/null (info). Mirrors the regex used in the
 * mockup `apps/Nakiros-new-design/conv-tabs.jsx`.
 */
function syntaxHighlight(value: unknown): React.ReactNode {
  const json = JSON.stringify(value, null, 2);
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|(\b-?\d+\.?\d*\b)|(\btrue|false|null\b)|([\s\S])/g;
  const out: React.ReactNode[] = [];
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(json)) !== null) {
    const [, str, isKey, num, bool, other] = match;
    if (str !== undefined) {
      const isKeyToken = isKey !== undefined;
      out.push(
        <span key={key++} className={isKeyToken ? 'text-n-accent' : 'text-n-healthy'}>
          {str}
        </span>,
      );
      if (isKey !== undefined) {
        out.push(
          <span key={key++} className="text-n-faint">
            {isKey}
          </span>,
        );
      }
    } else if (num !== undefined) {
      out.push(
        <span key={key++} className="text-n-watch">
          {num}
        </span>,
      );
    } else if (bool !== undefined) {
      out.push(
        <span key={key++} className="text-n-info">
          {bool}
        </span>,
      );
    } else if (other !== undefined) {
      out.push(<Fragment key={key++}>{other}</Fragment>);
    }
  }
  return out;
}
