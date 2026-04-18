import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  AgentProvider,
  AppPreferences,
  LanguagePreference,
} from '@nakiros/shared';
import { getAgentDefinitionLabel, type AgentDefinition } from '../../constants/agents';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '../ui';

export type GlobalSettingsStatus = 'idle' | 'saving' | 'saved' | 'error';
export type GlobalSettingsUpdateStatus = 'idle' | 'checking' | 'updating' | 'success' | 'error';
export type AgentCliStatus = {
  provider: 'claude' | 'codex' | 'cursor';
  label: string;
  command: string;
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
};

interface GlobalSettingsGeneralSectionProps {
  preferences: AppPreferences;
  status: GlobalSettingsStatus;
  statusText: string;
  onUpdate(partial: Partial<AppPreferences>): Promise<void>;
}

interface GlobalSettingsAgentAISectionProps {
  preferences: AppPreferences;
  status: GlobalSettingsStatus;
  statusText: string;
  cliInfo: AgentCliStatus[] | null;
  cliLoading: boolean;
  providerAvailability: Map<AgentProvider, boolean>;
  selectedProviderMissing: boolean;
  onUpdate(partial: Partial<AppPreferences>): Promise<void>;
}

interface GlobalSettingsAgentNakirosSectionProps {
  agentDefinitions: AgentDefinition[];
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50';
const settingsCardClass = 'rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] shadow-none';
const settingsCardHeaderClass = 'p-5 pb-3 sm:p-6 sm:pb-3';
const settingsCardTitleClass = 'text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]';
const settingsCardContentClass = 'px-5 pb-5 pt-0 sm:px-6 sm:pb-6';
const settingsInsetCardClass = 'rounded-[14px] border-[var(--line)] bg-[var(--bg-card)] shadow-none';
const selectedButtonClass = 'border-[var(--line-strong)] bg-[var(--bg-card)] text-[var(--text)] hover:bg-[var(--bg-card)] hover:text-[var(--text)]';

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="m-0 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── General section ──────────────────────────────────────────────────────────

export function GlobalSettingsGeneralSection({
  preferences,
  status,
  statusText,
  onUpdate,
}: GlobalSettingsGeneralSectionProps) {
  const { t } = useTranslation('settings');
  const desktopNotificationsEnabled = preferences.desktopNotificationsEnabled !== false;
  const desktopNotificationThreshold = Math.min(
    3600,
    Math.max(0, Math.round(preferences.desktopNotificationMinDurationSeconds ?? 60)),
  );
  const [desktopThresholdInput, setDesktopThresholdInput] = useState(String(desktopNotificationThreshold));

  useEffect(() => {
    setDesktopThresholdInput(String(desktopNotificationThreshold));
  }, [desktopNotificationThreshold]);

  async function handleDesktopThresholdBlur() {
    let nextThreshold = Number.parseInt(desktopThresholdInput, 10);
    if (!Number.isFinite(nextThreshold)) nextThreshold = 60;
    nextThreshold = Math.min(3600, Math.max(0, Math.round(nextThreshold)));
    setDesktopThresholdInput(String(nextThreshold));
    if (nextThreshold === desktopNotificationThreshold) return;
    await onUpdate({ desktopNotificationMinDurationSeconds: nextThreshold });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('navGeneral')}</h2>
        <p className="m-0 text-sm text-muted-foreground">{t('subtitle')}</p>
        {statusText && (
          <p className={clsx('mb-0 mt-2 text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {statusText}
          </p>
        )}
      </div>

      {/* Language */}
      <Card className={settingsCardClass}>
        <CardHeader className={settingsCardHeaderClass}>
          <CardTitle className={settingsCardTitleClass}>
            {t('languageTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className={settingsCardContentClass}>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['system', t('languageSystem')],
              ['fr', t('languageFrench')],
              ['en', t('languageEnglish')],
            ] as [LanguagePreference, string][]).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onUpdate({ language: value })}
                className={clsx(
                  preferences.language === value &&
                    selectedButtonClass,
                )}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Desktop notifications */}
      <Card className={settingsCardClass}>
        <CardHeader className={settingsCardHeaderClass}>
          <CardTitle className={settingsCardTitleClass}>
            {t('desktopNotificationsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className={clsx(settingsCardContentClass, 'flex flex-col gap-3')}>
          <p className="m-0 text-xs text-muted-foreground">{t('desktopNotificationsHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
                onClick={() => void onUpdate({ desktopNotificationsEnabled: true })}
                className={clsx(
                  desktopNotificationsEnabled &&
                    selectedButtonClass,
                )}
              >
              {t('desktopNotificationsOn')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
                onClick={() => void onUpdate({ desktopNotificationsEnabled: false })}
                className={clsx(
                  !desktopNotificationsEnabled &&
                    selectedButtonClass,
                )}
              >
              {t('desktopNotificationsOff')}
            </Button>
          </div>
          <Input
            type="number"
            min={0}
            max={3600}
            step={1}
            label={t('desktopNotificationsThresholdLabel')}
            hint={t('desktopNotificationsThresholdHint')}
            value={desktopThresholdInput}
            onChange={(event) => setDesktopThresholdInput(event.target.value)}
            onBlur={() => void handleDesktopThresholdBlur()}
            disabled={!desktopNotificationsEnabled}
            className="max-w-[220px]"
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Agent AI section ─────────────────────────────────────────────────────────

export function GlobalSettingsAgentAISection({
  preferences,
  status,
  statusText,
  cliInfo,
  cliLoading,
  providerAvailability,
  selectedProviderMissing,
  onUpdate,
}: GlobalSettingsAgentAISectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('navAgentAI')}</h2>
        <p className="m-0 text-sm text-muted-foreground">{t('agentAISubtitle')}</p>
        {statusText && (
          <p className={clsx('mb-0 mt-2 text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {statusText}
          </p>
        )}
      </div>

      <Card className={settingsCardClass}>
        <CardHeader className={settingsCardHeaderClass}>
          <CardTitle className={settingsCardTitleClass}>
            {t('agentProviderTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className={clsx(settingsCardContentClass, 'flex flex-col gap-4')}>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['claude', t('agentProviderClaude')],
              ['codex', t('agentProviderCodex')],
              ['cursor', t('agentProviderCursor')],
            ] as [AgentProvider, string][]).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onUpdate({ agentProvider: value })}
                disabled={cliInfo != null && providerAvailability.get(value) === false}
                className={clsx(
                  (preferences.agentProvider ?? 'claude') === value &&
                    selectedButtonClass,
                  cliInfo != null && providerAvailability.get(value) === false && 'opacity-45',
                )}
              >
                {label}
              </Button>
            ))}
          </div>

          {selectedProviderMissing && (
            <p className="m-0 text-xs text-destructive">{t('agentCliStatusMissingWarning')}</p>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {t('agentCliStatusTitle')}
            </p>
            {cliLoading && (
              <p className="m-0 text-xs text-muted-foreground">{t('agentCliStatusChecking')}</p>
            )}
            {!cliLoading && cliInfo && (
              <div className="flex flex-col gap-2">
                {cliInfo.map((entry) => (
                  <Card key={entry.provider} className={settingsInsetCardClass}>
                    <CardContent className="p-4">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <strong className="text-sm text-foreground">{entry.label}</strong>
                        <span
                          className={clsx(
                            'text-xs',
                            entry.installed ? 'text-muted-foreground' : 'text-destructive',
                          )}
                        >
                          {entry.installed ? t('envDetected') : t('envNotDetected')}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {entry.command} · {entry.version ?? t('agentCliStatusVersionUnknown')}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Agent Nakiros section ────────────────────────────────────────────────────

export function GlobalSettingsAgentNakirosSection({
  agentDefinitions,
}: GlobalSettingsAgentNakirosSectionProps) {
  const { t } = useTranslation('settings');
  const { t: tAgent } = useTranslation('agent');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('navAgentNakiros')}</h2>
        <p className="m-0 text-sm text-muted-foreground">{t('agentNakirosSubtitle')}</p>
      </div>

      <Card className={settingsCardClass}>
        <CardHeader className={settingsCardHeaderClass}>
          <CardTitle className={settingsCardTitleClass}>
            {t('catalog')}
          </CardTitle>
        </CardHeader>
        <CardContent className={clsx(settingsCardContentClass, 'flex flex-col gap-3')}>
          <p className="m-0 text-xs text-muted-foreground">{t('catalogSubtitle')}</p>
          <div className="flex flex-col gap-2">
            {agentDefinitions.map((capability) => (
              <Card key={capability.id} className={settingsInsetCardClass}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <strong className="text-sm text-foreground">
                        {getAgentDefinitionLabel(capability, tAgent)}
                      </strong>
                      <code className="text-xs text-muted-foreground">{capability.command}</code>
                    </div>
                    <span
                      className={clsx(
                        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.04em]',
                        capability.kind === 'agent'
                          ? 'border-[var(--line-strong)] bg-[var(--bg-soft)] text-[var(--text)]'
                          : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text-muted)]',
                      )}
                    >
                      {capability.kind === 'agent' ? t('agentKindLabel') : t('workflowKindLabel')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
