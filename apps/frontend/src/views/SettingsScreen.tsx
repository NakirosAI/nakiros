import { useTranslation } from 'react-i18next';
import {
  CLAUDE_MODEL_LABELS,
  DEFAULT_EVAL_MODEL,
  resolveModelFullId,
  type LanguagePreference,
} from '@nakiros/shared';
import { usePreferences } from '../hooks/usePreferences';
import ConversationIngestPanel from './ConversationIngestPanel';

/**
 * New-design Settings — port of the `SettingsScreen` in
 * `apps/Nakiros-new-design/screens-runs.jsx:935-957`. Mirrors the mockup's
 * "label / value" card layout while wiring the language row to the live
 * `usePreferences()` context (legacy parity for the language switcher
 * that the new shell topbar dropped). Other cards remain informational.
 */
export default function SettingsScreen() {
  const { t } = useTranslation('settings');
  const { preferences, updatePreferences } = usePreferences();
  const currentLanguage: LanguagePreference = preferences.language ?? 'system';

  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('languageSystem') },
    { value: 'fr', label: t('languageFrench') },
    { value: 'en', label: t('languageEnglish') },
  ];

  const handleLanguageChange = async (next: LanguagePreference) => {
    if (next === currentLanguage) return;
    await updatePreferences({ ...preferences, language: next });
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto w-full max-w-[720px] px-8 py-9 font-n-sans">
      <h1 className="m-0 mb-1 font-n-mono text-[18px] font-medium text-n-fg">Settings</h1>
      <p className="mt-0 mb-6 text-[13px] text-n-muted">
        Local-only · stored at <span className="font-n-mono">~/.nakiros/preferences.json</span>
      </p>

      <SettingCard label={t('languageTitle')}>
        <div className="flex flex-wrap items-center gap-1.5">
          {languageOptions.map((option) => {
            const isActive = option.value === currentLanguage;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void handleLanguageChange(option.value)}
                className={
                  'inline-flex h-7 items-center rounded-n-sm border px-2.5 font-n-mono text-[11.5px] transition-colors ' +
                  (isActive
                    ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                    : 'border-n-border-subtle bg-transparent text-n-muted hover:bg-n-raised hover:text-n-fg')
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </SettingCard>

      <SettingCard label="Daemon port" value="127.0.0.1:4242" mono />
      <SettingCard label="Claude projects path" value="~/.claude/projects/" mono />
      <SettingCard label="Telemetry" value="Disabled · 100% local · no cloud calls" />
      <SettingCard
        label="Default model for runs"
        value={`${CLAUDE_MODEL_LABELS[DEFAULT_EVAL_MODEL]} · ${resolveModelFullId(DEFAULT_EVAL_MODEL)}`}
        mono
      />
      <SettingCard label="Auto-rescan on launch" value="Enabled" />

      <ConversationIngestPanel />
    </div>
    </div>
  );
}

interface SettingCardProps {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}

function SettingCard({ label, value, mono, children }: SettingCardProps) {
  return (
    <div className="mb-2 rounded-n-lg border border-n-border-subtle bg-n-surface px-4 py-3 shadow-n-card">
      <div className="flex items-center gap-3.5">
        <span className="flex-1 text-[13px] text-n-fg">{label}</span>
        {children ?? (
          <span className={(mono ? 'font-n-mono ' : '') + 'text-[12.5px] text-n-muted'}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
