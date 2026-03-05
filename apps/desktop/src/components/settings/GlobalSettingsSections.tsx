import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  AgentProvider,
  AppPreferences,
  LanguagePreference,
} from '@nakiros/shared';
import { getAgentDefinitionLabel, type AgentDefinition } from '../../constants/agents';
import { formatLastCheck } from '../../utils/dates';
import { Badge, Button, Card, Input } from '../ui';

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

interface GlobalSettingsMcpNakirosSectionProps {
  status: GlobalSettingsStatus;
  statusText: string;
  mcpServerInput: string;
  onMcpServerInputChange(value: string): void;
  onMcpServerBlur(): Promise<void>;
}

interface GlobalSettingsAgentNakirosSectionProps {
  versionInfo: BundleVersionInfo | null;
  agentDefinitions: AgentDefinition[];
  updateResult: UpdateCheckResult | null;
  updateStatus: GlobalSettingsUpdateStatus;
  updateMsg: string;
  onApplyUpdate(): Promise<void>;
  onCheckUpdates(): Promise<void>;
}

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
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navGeneral')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('subtitle')}</p>
        {statusText && (
          <p
            className={clsx(
              'mb-0 mt-2 text-xs',
              status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]',
            )}
          >
            {statusText}
          </p>
        )}
      </div>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('languageTitle')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['system', t('languageSystem')],
            ['fr', t('languageFrench')],
            ['en', t('languageEnglish')],
          ] as [LanguagePreference, string][]).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onUpdate({ language: value })}
              className={clsx(
                'h-8 rounded-[10px] px-2.5 text-xs font-bold',
                preferences.language === value
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]',
              )}
            >
              {label}
            </Button>
          ))}
        </div>
      </Card>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('desktopNotificationsTitle')}
        </span>
        <p className="m-0 text-xs text-[var(--text-muted)]">{t('desktopNotificationsHint')}</p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onUpdate({ desktopNotificationsEnabled: true })}
            className={clsx(
              'h-8 rounded-[10px] px-2.5 text-xs font-bold',
              desktopNotificationsEnabled
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]',
            )}
          >
            {t('desktopNotificationsOn')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void onUpdate({ desktopNotificationsEnabled: false })}
            className={clsx(
              'h-8 rounded-[10px] px-2.5 text-xs font-bold',
              !desktopNotificationsEnabled
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]',
            )}
          >
            {t('desktopNotificationsOff')}
          </Button>
        </div>

        <div className="mt-3">
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
            className="max-w-[220px] rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
          />
        </div>
      </Card>
    </div>
  );
}

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
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navAgentAI')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('agentAISubtitle')}</p>
        {statusText && (
          <p
            className={clsx(
              'mb-0 mt-2 text-xs',
              status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]',
            )}
          >
            {statusText}
          </p>
        )}
      </div>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('agentProviderTitle')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['claude', t('agentProviderClaude')],
            ['codex', t('agentProviderCodex')],
            ['cursor', t('agentProviderCursor')],
          ] as [AgentProvider, string][]).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onUpdate({ agentProvider: value })}
              disabled={cliInfo != null && providerAvailability.get(value) === false}
              className={clsx(
                'h-8 rounded-[10px] px-2.5 text-xs font-bold',
                (preferences.agentProvider ?? 'claude') === value
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                  : 'border-[var(--line)] bg-[var(--bg-soft)] text-[var(--text)]',
                cliInfo != null && providerAvailability.get(value) === false && 'opacity-[0.45]',
              )}
            >
              {label}
            </Button>
          ))}
        </div>

        {selectedProviderMissing && (
          <p className="mb-0 mt-2 text-xs text-[var(--danger)]">
            {t('agentCliStatusMissingWarning')}
          </p>
        )}

        <div className="mt-3.5">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
            {t('agentCliStatusTitle')}
          </span>

          {cliLoading && (
            <p className="m-0 text-xs text-[var(--text-muted)]">{t('agentCliStatusChecking')}</p>
          )}

          {!cliLoading && cliInfo && (
            <div className="flex flex-col gap-2">
              {cliInfo.map((entry) => (
                <Card key={entry.provider} padding="sm" className="rounded-[10px] bg-[var(--bg-card)]">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <strong className="text-[13px]">{entry.label}</strong>
                    <span className={clsx('text-[11px]', entry.installed ? 'text-[var(--text-muted)]' : 'text-[var(--danger)]')}>
                      {entry.installed ? t('envDetected') : t('envNotDetected')}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-muted)]">
                    {entry.command}
                    {' · '}
                    {entry.version ?? t('agentCliStatusVersionUnknown')}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function GlobalSettingsMcpNakirosSection({
  status,
  statusText,
  mcpServerInput,
  onMcpServerInputChange,
  onMcpServerBlur,
}: GlobalSettingsMcpNakirosSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navMcpNakiros')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('mcpNakirosSubtitle')}</p>
        {statusText && (
          <p
            className={clsx(
              'mb-0 mt-2 text-xs',
              status === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]',
            )}
          >
            {statusText}
          </p>
        )}
      </div>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <Input
          type="text"
          label={t('mcpServerLabel')}
          hint={t('mcpServerHint')}
          placeholder={t('mcpServerPlaceholder')}
          value={mcpServerInput}
          onChange={(event) => onMcpServerInputChange(event.target.value)}
          onBlur={() => void onMcpServerBlur()}
          className="rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] px-2.5 py-2 text-[13px]"
        />
      </Card>
    </div>
  );
}

export function GlobalSettingsAgentNakirosSection({
  versionInfo,
  agentDefinitions,
  updateResult,
  updateStatus,
  updateMsg,
  onApplyUpdate,
  onCheckUpdates,
}: GlobalSettingsAgentNakirosSectionProps) {
  const { t } = useTranslation('settings');
  const { t: tAgent } = useTranslation('agent');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="mb-1 mt-0 text-xl font-bold">{t('navAgentNakiros')}</h2>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('agentNakirosSubtitle')}</p>
      </div>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('agentsWorkflowsTitle')}
        </span>

        {versionInfo && (
          <p className="mb-3.5 mt-0 text-xs text-[var(--text-muted)]">
            {t('installedVersion')}{' '}
            <strong className="text-[var(--text)]">{versionInfo.bundle_version}</strong>
            {' · '}
            {t('lastCheck')}{' '}
            {formatLastCheck(versionInfo.last_check, t)}
          </p>
        )}

        {updateResult?.compatible === false && (
          <div className="mb-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] px-3.5 py-3">
            <p className="mb-1 mt-0 text-[13px] font-bold text-[var(--text)]">
              {t('incompatibleUpdate')}
            </p>
            <p className="m-0 text-xs text-[var(--text-muted)]">
              {updateResult.incompatibleMessage ?? t('incompatibleUpdateDesc', { version: updateResult.latestVersion })}
            </p>
          </div>
        )}

        {updateResult?.hasUpdate && (
          <div className="mb-3 rounded-[10px] border border-[var(--primary)] bg-[var(--primary-soft)] px-3.5 py-3">
            <p className="mb-1 mt-0 text-[13px] font-bold text-[var(--primary)]">
              {t('updateVersionAvailable', { version: updateResult.latestVersion })}
            </p>
            {updateResult.changelog && (
              <p className="m-0 text-xs text-[var(--text-muted)]">{updateResult.changelog}</p>
            )}
            <Button
              type="button"
              onClick={() => void onApplyUpdate()}
              disabled={updateStatus === 'updating'}
              className="mt-2.5 h-8 rounded-[10px] px-2.5 text-xs font-bold"
            >
              {updateStatus === 'updating' ? t('updating') : t('updateNow')}
            </Button>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void onCheckUpdates()}
          disabled={updateStatus === 'checking' || updateStatus === 'updating'}
          className="h-8 rounded-[10px] px-3 text-[13px] font-semibold"
        >
          {updateStatus === 'checking' ? t('checking') : t('checkForUpdates')}
        </Button>

        {updateMsg && (
          <p
            className={clsx(
              'mb-0 mt-2 text-xs',
              updateStatus === 'error' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]',
            )}
          >
            {updateMsg}
          </p>
        )}
      </Card>

      <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          {t('catalog')}
        </span>
        <p className="m-0 text-xs text-[var(--text-muted)]">{t('catalogSubtitle')}</p>

        <div className="mt-2.5 flex flex-col gap-2">
          {agentDefinitions.map((capability) => (
            <Card key={capability.id} padding="sm" className="rounded-[10px] bg-[var(--bg-card)]">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 flex-col gap-1">
                  <strong className="text-[13px]">
                    {getAgentDefinitionLabel(capability, tAgent)}
                  </strong>
                  <code className="text-[11px]">{capability.command}</code>
                </div>
                <Badge
                  variant={capability.kind === 'agent' ? 'info' : 'muted'}
                  className="shrink-0 uppercase tracking-[0.04em]"
                >
                  {capability.kind === 'agent' ? t('agentKindLabel') : t('workflowKindLabel')}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  );
}
