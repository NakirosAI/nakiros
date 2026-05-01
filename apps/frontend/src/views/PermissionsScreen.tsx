import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Save, ShieldCheck } from 'lucide-react';
import type {
  PermissionsDefaultMode,
  PermissionsFileContent,
  PermissionsScope,
  Project,
} from '@nakiros/shared';
import { usePermissions } from './permissions/usePermissions';
import ChipPicker from './permissions/ChipPicker';

interface PermissionsScreenProps {
  project: Project;
}

const DEFAULT_MODES: PermissionsDefaultMode[] = [
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
];

const ALLOW_SUGGESTIONS = [
  'Bash(pnpm *)',
  'Bash(npm *)',
  'Bash(git status)',
  'Bash(git diff *)',
  'Read',
  'Edit',
  'Write',
  'WebFetch',
];

const DENY_SUGGESTIONS = [
  'Bash(rm -rf *)',
  'Bash(curl *)',
  'Bash(npm publish *)',
  'WebFetch',
];

const ASK_SUGGESTIONS = ['Bash(git push *)', 'Bash(*)'];

/**
 * Editor for `.claude/settings.json` and `.claude/settings.local.json`,
 * focused on the `permissions` block (allow / deny / ask + defaultMode).
 * Other top-level keys (model, env, hooks, apiKeyHelper, …) survive saves
 * via the round-tripped `rest` JSON field, exposed in a "Other settings"
 * raw textarea so power users can still tweak them.
 */
export default function PermissionsScreen({ project }: PermissionsScreenProps) {
  const { t } = useTranslation('permissions');
  const [scope, setScope] = useState<PermissionsScope>('project');
  const { file, loading, error, refresh, save } = usePermissions(project.id, scope);

  // Editor state derived from `file`; reset when file changes (scope switch
  // or external reload).
  const [allow, setAllow] = useState<string[]>([]);
  const [deny, setDeny] = useState<string[]>([]);
  const [ask, setAsk] = useState<string[]>([]);
  const [defaultMode, setDefaultMode] = useState<PermissionsDefaultMode | null>(null);
  const [rest, setRest] = useState('');
  // Opaque round-trip blob — fields managed in other tabs (hooks,
  // outputStyle) that we preserve verbatim when saving here.
  const [preservedJson, setPreservedJson] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{
    code: string;
    message: string;
    showReload?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    setAllow(file.allow);
    setDeny(file.deny);
    setAsk(file.ask);
    setDefaultMode(file.defaultMode);
    setRest(file.rest);
    setPreservedJson(file.preservedJson);
    setErrorBanner(null);
  }, [file]);

  const dirty = useMemo(() => {
    if (!file) return false;
    return (
      !arrayEq(file.allow, allow) ||
      !arrayEq(file.deny, deny) ||
      !arrayEq(file.ask, ask) ||
      file.defaultMode !== defaultMode ||
      file.rest !== rest
    );
  }, [file, allow, deny, ask, defaultMode, rest]);

  const handleSave = async () => {
    if (!file) return;
    setErrorBanner(null);
    setSubmitting(true);
    const result = await save({
      scope,
      allow,
      deny,
      ask,
      defaultMode,
      rest,
      preservedJson,
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

  const handleReloadAfterConflict = () => {
    setErrorBanner(null);
    refresh();
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
            <ShieldCheck size={18} className="text-n-accent-strong" />
            {t('title')}
          </h1>
          <p className="m-0 mt-1 max-w-2xl text-pretty text-[13px] leading-relaxed text-n-muted">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeToggle scope={scope} onChange={setScope} fileExists={file.exists} />
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
              onClick={handleReloadAfterConflict}
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

      <div className="flex flex-1 flex-col gap-6 overflow-auto px-7 pb-8 pt-5">
        {/* Allow */}
        <Section
          label={t('sections.allow')}
          help={t('sections.allowHelp')}
          tone="positive"
        >
          <ChipPicker
            values={allow}
            suggestions={ALLOW_SUGGESTIONS}
            placeholder="Bash(pnpm *)"
            tone="positive"
            onChange={setAllow}
          />
        </Section>

        {/* Deny */}
        <Section
          label={t('sections.deny')}
          help={t('sections.denyHelp')}
          tone="negative"
        >
          <ChipPicker
            values={deny}
            suggestions={DENY_SUGGESTIONS}
            placeholder="Bash(rm -rf *)"
            tone="negative"
            onChange={setDeny}
          />
        </Section>

        {/* Ask */}
        <Section
          label={t('sections.ask')}
          help={t('sections.askHelp')}
          tone="warn"
        >
          <ChipPicker
            values={ask}
            suggestions={ASK_SUGGESTIONS}
            placeholder="Bash(git push *)"
            tone="warn"
            onChange={setAsk}
          />
        </Section>

        {/* Default mode */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('sections.defaultMode')}
          </label>
          <select
            value={defaultMode ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setDefaultMode(v === '' ? null : (v as PermissionsDefaultMode));
            }}
            className="w-full rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] text-n-fg focus:border-n-accent-line focus:outline-none"
          >
            <option value="">{t('sections.defaultModeNone')}</option>
            {DEFAULT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="mt-1 text-pretty text-[11.5px] leading-relaxed text-n-muted">
            {t('sections.defaultModeHelp')}
          </p>
        </div>

        {/* Other settings (raw JSON) */}
        <div>
          <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
            {t('sections.rest')}
          </label>
          <textarea
            value={rest}
            onChange={(e) => setRest(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder='{"model": "sonnet", "env": {"NODE_ENV": "development"}}'
            className="w-full resize-y rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] leading-relaxed text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
          <p className="mt-1 text-pretty text-[11.5px] leading-relaxed text-n-muted">
            {t('sections.restHelp')}
          </p>
        </div>

        {/* Cross-tab pointers */}
        <CrossTabHints />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────-

function ScopeToggle({
  scope,
  onChange,
  fileExists,
}: {
  scope: PermissionsScope;
  onChange(s: PermissionsScope): void;
  fileExists: boolean;
}) {
  const { t } = useTranslation('permissions');
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
            {active && !fileExists && (
              <span className="ml-1 text-n-subtle">·</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  label,
  help,
  tone,
  children,
}: {
  label: string;
  help: string;
  tone: 'positive' | 'negative' | 'warn';
  children: React.ReactNode;
}) {
  const dotClass =
    tone === 'positive'
      ? 'bg-n-accent-strong'
      : tone === 'negative'
        ? 'bg-[oklch(0.55_0.16_25)]'
        : 'bg-[oklch(0.65_0.13_85)]';
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <label className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
          {label}
        </label>
      </div>
      {children}
      <p className="mt-1 text-pretty text-[11.5px] leading-relaxed text-n-muted">{help}</p>
    </div>
  );
}

function CrossTabHints() {
  const { t } = useTranslation('permissions');
  return (
    <div className="rounded-n-md border border-dashed border-n-border-default bg-n-canvas px-4 py-3">
      <div className="mb-2 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {t('crossTab.title')}
      </div>
      <ul className="m-0 flex flex-col gap-1.5 p-0 text-[12px] text-n-muted">
        <li className="flex items-center gap-2">
          <ArrowRight size={12} className="flex-shrink-0 text-n-subtle" />
          {t('crossTab.outputStyle')}
        </li>
        <li className="flex items-center gap-2">
          <ArrowRight size={12} className="flex-shrink-0 text-n-subtle" />
          {t('crossTab.hooks')}
        </li>
      </ul>
    </div>
  );
}

function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Use this so the i18n-typed import isn't dropped.
export type { PermissionsFileContent };
