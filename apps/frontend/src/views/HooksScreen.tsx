import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, Save, Trash2, Zap } from 'lucide-react';
import type {
  HookEditEntry,
  HookEditEvent,
  HookEventName,
  PermissionsScope,
  Project,
} from '@nakiros/shared';
import { useHooks } from './hooks/useHooks';

interface HooksScreenProps {
  project: Project;
}

/**
 * Lifecycle-timeline editor for `.claude/settings.json` (and `.local`)'s
 * `hooks` block. Each event renders as a card with its hook entries
 * (matcher + command + optional timeout) and a "+ Add hook" button.
 *
 * Co-owns `settings.json` with the Permissions tab — both round-trip the
 * other's slice via the opaque `preservedJson` field, so saves never
 * destroy each other's config.
 */
export default function HooksScreen({ project }: HooksScreenProps) {
  const { t } = useTranslation('hooks');
  const [scope, setScope] = useState<PermissionsScope>('project');
  const { file, loading, error, refresh, save } = useHooks(project.id, scope);

  const [events, setEvents] = useState<HookEditEvent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    setEvents(file.events);
    setErrorBanner(null);
  }, [file]);

  const dirty = useMemo(() => {
    if (!file) return false;
    return JSON.stringify(file.events) !== JSON.stringify(events);
  }, [file, events]);

  const handleSave = async () => {
    if (!file) return;
    setErrorBanner(null);
    setSubmitting(true);
    const result = await save({
      scope,
      events,
      preservedJson: file.preservedJson,
      mtimeAtRead: file.mtime,
    });
    setSubmitting(false);
    if (!result.ok) {
      setErrorBanner({
        code: result.code,
        message: result.message,
        showReload: result.code === 'conflict',
      });
    }
  };

  const updateEvent = (eventName: HookEventName, entries: HookEditEntry[]) => {
    setEvents(events.map((ev) => (ev.event === eventName ? { ...ev, entries } : ev)));
  };

  if (loading) {
    return (
      <div className="grid flex-1 place-items-center text-n-muted">{t('loading')}</div>
    );
  }
  if (error || !file) {
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-n-border-subtle px-7 py-5">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <Zap size={18} className="text-n-accent-strong" />
            {t('title')}
          </h1>
          <p className="m-0 mt-1 max-w-2xl text-pretty text-[13px] leading-relaxed text-n-muted">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeToggle scope={scope} onChange={setScope} />
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

      {/* Path + status banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-n-border-subtle bg-n-canvas px-7 py-2.5">
        <span className="break-all font-n-mono text-[11px] text-n-subtle" title={file.path}>
          {file.path}
        </span>
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
          {file.exists
            ? scope === 'local'
              ? t('badgeLocal')
              : t('badgeProject')
            : t('badgeMissing')}
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

      {file.parseError && (
        <div className="mx-7 mt-4 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2.5">
          <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-[oklch(0.55_0.16_25)]">
            {t('parseErrorTitle')}
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-n-fg">
            {t('parseErrorBody', { error: file.parseError })}
          </div>
        </div>
      )}

      {/* Lifecycle timeline */}
      <div className="flex-1 overflow-auto px-7 pb-8 pt-5">
        <div className="flex flex-col gap-3">
          {events.map((ev) => (
            <EventCard
              key={ev.event}
              event={ev}
              onChange={(entries) => updateEvent(ev.event, entries)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopeToggle({
  scope,
  onChange,
}: {
  scope: PermissionsScope;
  onChange(s: PermissionsScope): void;
}) {
  const { t } = useTranslation('hooks');
  return (
    <div className="inline-flex rounded-n-md border border-n-border-subtle bg-n-surface p-0.5">
      {(['project', 'local'] as PermissionsScope[]).map((s) => {
        const active = s === scope;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            title={s === 'local' ? t('scope.localTooltip') : t('scope.projectTooltip')}
            className={
              'rounded-[5px] px-2.5 py-1 font-n-mono text-[11px] transition-colors ' +
              (active
                ? 'bg-n-accent-soft text-n-accent-strong'
                : 'text-n-muted hover:text-n-fg')
            }
          >
            {s === 'project' ? t('scope.project') : t('scope.local')}
          </button>
        );
      })}
    </div>
  );
}

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
            <h3 className="m-0 font-n-mono text-[13px] font-semibold text-n-fg">{event.event}</h3>
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
      <div className="mt-1.5 font-n-mono text-[10.5px] text-n-subtle">
        {t('rowHelp')}
      </div>
    </div>
  );
}
