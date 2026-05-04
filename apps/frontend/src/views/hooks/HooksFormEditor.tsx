import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { HookEditEntry, HookEditEvent, HookEventName } from '@nakiros/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const KNOWN_EVENTS: HookEventName[] = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionEnd',
];

// ── Parsing helpers ────────────────────────────────────────────────────────────

/**
 * Converts a raw hooks JSON string (as stored in `.claude/settings.json`'s
 * `hooks` block) into the editor-friendly `HookEditEvent[]` representation.
 *
 * Handles both the nested `{ hooks: [{ command }] }` shape and the legacy
 * flat `{ command }` shape. Returns `null` when `value` is invalid JSON.
 */
function parseEventsFromJson(value: string): HookEditEvent[] | null {
  let parsed: Record<string, unknown>;
  try {
    const raw = JSON.parse(value) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    parsed = raw as Record<string, unknown>;
  } catch {
    return null;
  }

  return KNOWN_EVENTS.map((event) => {
    const raw = parsed[event];
    const entries: HookEditEntry[] = [];

    if (Array.isArray(raw)) {
      for (const item of raw as Record<string, unknown>[]) {
        // Nested shape: { matcher?, hooks: [{ type, command }] }
        const nestedHooks = item['hooks'];
        if (Array.isArray(nestedHooks)) {
          for (const h of nestedHooks as Record<string, unknown>[]) {
            entries.push({
              matcher: typeof item['matcher'] === 'string' ? item['matcher'] : '',
              command: typeof h['command'] === 'string' ? h['command'] : '',
              timeout: typeof item['timeout'] === 'number' ? item['timeout'] : null,
            });
          }
        } else {
          // Flat shape: { matcher?, command, timeout? }
          entries.push({
            matcher: typeof item['matcher'] === 'string' ? item['matcher'] : '',
            command: typeof item['command'] === 'string' ? item['command'] : '',
            timeout: typeof item['timeout'] === 'number' ? item['timeout'] : null,
          });
        }
      }
    }

    return { event, entries };
  });
}

/**
 * Serialises editor-friendly `HookEditEvent[]` back to the compact hooks JSON
 * object that Claude Code understands.
 *
 * Events with no entries are omitted, but empty entries (no command yet) are
 * preserved during editing so a freshly-added row stays visible. The save
 * pipeline / audit catch entries that ship with an empty command.
 */
function serializeEventsToJson(events: HookEditEvent[]): string {
  const obj: Record<string, unknown> = {};
  for (const ev of events) {
    if (ev.entries.length === 0) continue;
    obj[ev.event] = ev.entries.map((e) => {
      const entry: Record<string, unknown> = {};
      if (e.matcher.trim() !== '') entry['matcher'] = e.matcher.trim();
      entry['hooks'] = [{ type: 'command', command: e.command }];
      if (e.timeout !== null) entry['timeout'] = e.timeout;
      return entry;
    });
  }
  return JSON.stringify(obj, null, 2);
}

// ── Public interface ───────────────────────────────────────────────────────────

export interface HooksFormEditorProps {
  /** Hooks block as a JSON string (parseable). */
  value: string;
  /** Change handler — called with the updated JSON string after each form interaction. */
  onChange: (next: string) => void;
}

/**
 * Visual form editor for the hooks block stored in `.claude/settings.json`.
 *
 * Displays one card per lifecycle event. Each card lists its hook entries
 * (matcher + command + optional timeout) with add/remove controls.
 *
 * When `value` is not parseable JSON, renders a fallback message so the user
 * knows they must switch to JSON view to fix the syntax first.
 *
 * Uses the `hooks` i18n namespace (Module-6 bundle) for event labels and field
 * placeholders, and `hooks-runner` for the invalid-JSON fallback message.
 */
export default function HooksFormEditor({ value, onChange }: HooksFormEditorProps) {
  const { t: tRunner } = useTranslation('hooks-runner');

  const events = useMemo(() => parseEventsFromJson(value), [value]);

  if (events === null) {
    return (
      <div className="flex items-center gap-2 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-3">
        <AlertTriangle size={14} className="flex-shrink-0 text-[oklch(0.55_0.16_25)]" />
        <span className="font-n-mono text-[12px] text-[oklch(0.50_0.16_25)]">
          {tRunner('editTab.formCannotRenderInvalid')}
        </span>
      </div>
    );
  }

  const updateEvent = (eventName: HookEventName, entries: HookEditEntry[]) => {
    const updated = events.map((ev) =>
      ev.event === eventName ? { ...ev, entries } : ev,
    );
    onChange(serializeEventsToJson(updated));
  };

  return (
    <div className="flex flex-col gap-3">
      {events.map((ev) => (
        <EventCard key={ev.event} event={ev} onChange={(entries) => updateEvent(ev.event, entries)} />
      ))}
    </div>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({
  event,
  onChange,
}: {
  event: HookEditEvent;
  onChange(next: HookEditEntry[]): void;
}) {
  const { t } = useTranslation('hooks');
  const active = event.entries.length > 0;

  const addEntry = () => {
    onChange([...event.entries, { matcher: '', command: '', timeout: null }]);
  };
  const updateEntry = (i: number, patch: Partial<HookEditEntry>) => {
    onChange(event.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const removeEntry = (i: number) => onChange(event.entries.filter((_, idx) => idx !== i));

  return (
    <section
      className={
        'rounded-n-lg border bg-n-surface ' +
        (active ? 'border-n-border-default' : 'border-n-border-subtle')
      }
    >
      <header className="flex items-start justify-between gap-3 border-b border-n-border-subtle px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className={
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 font-n-mono text-[10.5px] font-semibold ' +
              (active
                ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                : 'border-n-border-subtle bg-n-canvas text-n-subtle')
            }
          >
            {event.entries.length || ''}
          </div>
          <div>
            <h3 className="m-0 font-n-mono text-[13px] font-semibold text-n-fg">
              {event.event}
            </h3>
            <p className="m-0 mt-0.5 text-pretty text-[11.5px] leading-relaxed text-n-muted">
              {t(`events.${event.event}`)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-n-sm border border-n-border-subtle bg-transparent px-2 py-1 font-n-mono text-[11px] text-n-muted hover:bg-n-canvas"
        >
          <Plus size={11} strokeWidth={2.5} /> {t('addHook')}
        </button>
      </header>

      {event.entries.length > 0 && (
        <div className="flex flex-col gap-2 px-4 py-3">
          {event.entries.map((entry, i) => (
            <HookRow
              key={i}
              entry={entry}
              onChange={(patch) => updateEntry(i, patch)}
              onRemove={() => removeEntry(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Hook row ──────────────────────────────────────────────────────────────────

function HookRow({
  entry,
  onChange,
  onRemove,
}: {
  entry: HookEditEntry;
  onChange(patch: Partial<HookEditEntry>): void;
  onRemove(): void;
}) {
  const { t } = useTranslation('hooks');
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={entry.matcher}
          onChange={(e) => onChange({ matcher: e.target.value })}
          placeholder={t('rowMatcherPlaceholder')}
          className="w-44 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
        <span className="font-n-mono text-[11.5px] text-n-subtle">→</span>
        <input
          type="text"
          value={entry.command}
          onChange={(e) => onChange({ command: e.target.value })}
          placeholder={t('rowCommandPlaceholder')}
          className="min-w-[200px] flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
        <input
          type="number"
          min={0}
          value={entry.timeout ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ timeout: v === '' ? null : Math.max(0, Number(v)) });
          }}
          placeholder={t('rowTimeoutPlaceholder')}
          title={t('rowTimeoutTooltip')}
          className="w-20 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('removeRow')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-n-sm border border-n-border-subtle bg-n-surface text-n-muted hover:bg-n-canvas hover:text-[oklch(0.50_0.16_25)]"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="mt-1.5 font-n-mono text-[10.5px] text-n-subtle">{t('rowHelp')}</div>
    </div>
  );
}
