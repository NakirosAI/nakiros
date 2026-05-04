import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import ChipPicker from './ChipPicker';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Parsed representation of the permissions block. */
interface PermissionsBlock {
  allow: string[];
  ask: string[];
  deny: string[];
  defaultMode?: string;
  additionalDirectories?: string[];
  disableBypassPermissionsMode?: string;
  [key: string]: unknown;
}

const DEFAULT_MODES = [
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
] as const;

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

// ── Parsing helpers ────────────────────────────────────────────────────────────

function parseBlock(value: string): PermissionsBlock | null {
  if (!value || value.trim() === '') return { allow: [], ask: [], deny: [] };
  try {
    const raw = JSON.parse(value) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      return null;
    const obj = raw as Record<string, unknown>;
    return {
      allow: Array.isArray(obj['allow'])
        ? (obj['allow'] as string[]).filter((s) => typeof s === 'string')
        : [],
      ask: Array.isArray(obj['ask'])
        ? (obj['ask'] as string[]).filter((s) => typeof s === 'string')
        : [],
      deny: Array.isArray(obj['deny'])
        ? (obj['deny'] as string[]).filter((s) => typeof s === 'string')
        : [],
      defaultMode:
        typeof obj['defaultMode'] === 'string' ? obj['defaultMode'] : undefined,
      additionalDirectories: Array.isArray(obj['additionalDirectories'])
        ? (obj['additionalDirectories'] as string[]).filter(
            (s) => typeof s === 'string',
          )
        : undefined,
      disableBypassPermissionsMode:
        typeof obj['disableBypassPermissionsMode'] === 'string'
          ? (obj['disableBypassPermissionsMode'] as string)
          : undefined,
      ...obj,
    };
  } catch {
    return null;
  }
}

function serializeBlock(block: PermissionsBlock): string {
  const obj: Record<string, unknown> = {};
  if (block.allow.length > 0) obj['allow'] = block.allow;
  if (block.ask.length > 0) obj['ask'] = block.ask;
  if (block.deny.length > 0) obj['deny'] = block.deny;
  if (block.defaultMode) obj['defaultMode'] = block.defaultMode;
  if (block.additionalDirectories && block.additionalDirectories.length > 0)
    obj['additionalDirectories'] = block.additionalDirectories;
  if (block.disableBypassPermissionsMode !== undefined)
    obj['disableBypassPermissionsMode'] = block.disableBypassPermissionsMode;
  // Preserve any unknown keys from the original parse.
  for (const [k, v] of Object.entries(block)) {
    if (
      k !== 'allow' &&
      k !== 'ask' &&
      k !== 'deny' &&
      k !== 'defaultMode' &&
      k !== 'additionalDirectories' &&
      k !== 'disableBypassPermissionsMode'
    ) {
      obj[k] = v;
    }
  }
  return JSON.stringify(obj, null, 2);
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface PermissionsFormEditorProps {
  /** Permissions block as a JSON string (parseable). */
  value: string;
  /** Change handler — called with the updated JSON string after each form interaction. */
  onChange: (next: string) => void;
}

/**
 * Visual form editor for the permissions block stored in `.claude/settings.json`.
 *
 * Renders three chip-list sections (Allow / Ask / Deny), a defaultMode
 * select, and an additionalDirectories list editor.
 *
 * When `value` is not parseable JSON, renders a fallback message so the user
 * knows they must switch to JSON view to fix the syntax first.
 *
 * Uses the `permissions` i18n namespace (Module-4 bundle) for field labels
 * and `permissions-runner` for the invalid-JSON fallback message.
 */
export default function PermissionsFormEditor({
  value,
  onChange,
}: PermissionsFormEditorProps) {
  const { t } = useTranslation('permissions-runner');

  const block = useMemo(() => parseBlock(value), [value]);

  if (block === null) {
    return (
      <div className="flex items-center gap-2 rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-3">
        <AlertTriangle
          size={14}
          className="flex-shrink-0 text-[oklch(0.55_0.16_25)]"
        />
        <span className="font-n-mono text-[12px] text-[oklch(0.50_0.16_25)]">
          {t('editTab.formCannotRenderInvalid')}
        </span>
      </div>
    );
  }

  const update = (patch: Partial<PermissionsBlock>) => {
    onChange(serializeBlock({ ...block, ...patch }));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Allow */}
      <FormSection
        label={t('editTab.allow')}
        tone="positive"
      >
        <ChipPicker
          values={block.allow}
          suggestions={ALLOW_SUGGESTIONS}
          placeholder="Bash(pnpm *)"
          tone="positive"
          onChange={(allow) => update({ allow })}
        />
      </FormSection>

      {/* Ask */}
      <FormSection
        label={t('editTab.ask')}
        tone="warn"
      >
        <ChipPicker
          values={block.ask}
          suggestions={ASK_SUGGESTIONS}
          placeholder="Bash(git push *)"
          tone="warn"
          onChange={(ask) => update({ ask })}
        />
      </FormSection>

      {/* Deny */}
      <FormSection
        label={t('editTab.deny')}
        tone="negative"
      >
        <ChipPicker
          values={block.deny}
          suggestions={DENY_SUGGESTIONS}
          placeholder="Bash(rm -rf *)"
          tone="negative"
          onChange={(deny) => update({ deny })}
        />
      </FormSection>

      {/* Default mode */}
      <div>
        <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
          {t('editTab.defaultMode')}
        </label>
        <select
          value={block.defaultMode ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            update({ defaultMode: v === '' ? undefined : v });
          }}
          className="w-full rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 font-n-mono text-[12px] text-n-fg focus:border-n-accent-line focus:outline-none"
        >
          <option value="">{t('editTab.defaultModeNone')}</option>
          {DEFAULT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {block.defaultMode === 'bypassPermissions' && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded-n-sm border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-2 py-1.5 font-n-mono text-[11px] text-[oklch(0.50_0.16_25)]">
            <AlertTriangle size={12} className="flex-shrink-0" />
            {t('editTab.warnings.bypassMode')}
          </div>
        )}
      </div>

      {/* Additional directories */}
      <AdditionalDirectoriesEditor
        directories={block.additionalDirectories ?? []}
        onChange={(additionalDirectories) => update({ additionalDirectories })}
        t={t}
      />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function FormSection({
  label,
  tone,
  children,
}: {
  label: string;
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
    </div>
  );
}

// ── Additional directories editor ─────────────────────────────────────────────

function AdditionalDirectoriesEditor({
  directories,
  onChange,
  t,
}: {
  directories: string[];
  onChange(next: string[]): void;
  t: (key: string) => string;
}) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const canAdd = trimmed.length > 0 && !directories.includes(trimmed);

  const add = () => {
    if (!canAdd) return;
    onChange([...directories, trimmed]);
    setDraft('');
  };

  return (
    <div>
      <label className="mb-1.5 block font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {t('editTab.additionalDirectories')}
      </label>
      <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
        {directories.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {directories.map((dir, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1"
              >
                <span className="flex-1 break-all font-n-mono text-[11.5px] text-n-fg">
                  {dir}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(directories.filter((_, idx) => idx !== i))
                  }
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-n-muted hover:bg-black/10"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t('editTab.directoryPlaceholder')}
            className="flex-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11.5px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="inline-flex items-center gap-1 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1 font-n-mono text-[11px] text-n-muted hover:bg-n-canvas disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={11} strokeWidth={2.5} /> {t('editTab.addDirectory')}
          </button>
        </div>
      </div>
    </div>
  );
}
