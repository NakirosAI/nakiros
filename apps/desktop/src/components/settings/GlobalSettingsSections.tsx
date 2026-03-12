import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type {
  AgentProvider,
  AppPreferences,
  LanguagePreference,
} from '@nakiros/shared';
import { getAgentDefinitionLabel, type AgentDefinition } from '../../constants/agents';
import { formatLastCheck } from '../../utils/dates';
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

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50';

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
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; email?: string; userId?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    void window.nakiros.authGetState().then((state) => {
      setAuthState({ isAuthenticated: state.isAuthenticated, email: state.email, userId: state.userId });
    });
    const unsubComplete = window.nakiros.onAuthComplete(() => {
      void window.nakiros.authGetState().then((nextState) => {
        setAuthState({ isAuthenticated: nextState.isAuthenticated, email: nextState.email, userId: nextState.userId });
      });
      setAuthLoading(false);
    });
    const unsubError = window.nakiros.onAuthError(() => {
      setAuthLoading(false);
    });
    return () => { unsubComplete(); unsubError(); };
  }, []);

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

      {/* Account */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t('accountTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {authState?.isAuthenticated ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{authState.email ?? t('accountConnected')}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={authLoading}
                onClick={() => {
                  setAuthLoading(true);
                  void window.nakiros.authSignOut().then(() => {
                    setAuthState({ isAuthenticated: false });
                    setAuthLoading(false);
                  });
                }}
              >
                {t('accountSignOut')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t('accountNotConnected')}</span>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={authLoading}
                onClick={() => {
                  setAuthLoading(true);
                  void window.nakiros.authSignIn();
                }}
              >
                {authLoading ? t('accountConnecting') : t('accountSignIn')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Language */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t('languageTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
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
                    'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
                )}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Desktop notifications */}
      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t('desktopNotificationsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          <p className="m-0 text-xs text-muted-foreground">{t('desktopNotificationsHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onUpdate({ desktopNotificationsEnabled: true })}
              className={clsx(
                desktopNotificationsEnabled &&
                  'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
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
                  'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
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

      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t('agentProviderTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
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
                    'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
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
                  <Card key={entry.provider} className="border-border/60 bg-muted/40 shadow-none">
                    <CardContent className="py-2.5">
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

// ─── MCP Nakiros section ──────────────────────────────────────────────────────

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
        <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('navMcpNakiros')}</h2>
        <p className="m-0 text-sm text-muted-foreground">{t('mcpNakirosSubtitle')}</p>
        {statusText && (
          <p className={clsx('mb-0 mt-2 text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {statusText}
          </p>
        )}
      </div>

      <Card className="border-border/80 shadow-none">
        <CardContent className="flex flex-col gap-1.5 pt-6">
          <label className="text-xs font-medium text-foreground">{t('mcpServerLabel')}</label>
          <input
            type="text"
            placeholder={t('mcpServerPlaceholder')}
            value={mcpServerInput}
            onChange={(event) => onMcpServerInputChange(event.target.value)}
            onBlur={() => void onMcpServerBlur()}
            className={inputClass}
          />
          <p className="m-0 text-xs text-muted-foreground">{t('mcpServerHint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Agent Nakiros section ────────────────────────────────────────────────────

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
        <h2 className="mb-1 mt-0 text-xl font-bold text-foreground">{t('navAgentNakiros')}</h2>
        <p className="m-0 text-sm text-muted-foreground">{t('agentNakirosSubtitle')}</p>
      </div>

      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t('agentsWorkflowsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          {versionInfo && (
            <p className="m-0 text-xs text-muted-foreground">
              {t('installedVersion')}{' '}
              <strong className="text-foreground">{versionInfo.bundle_version}</strong>
              {' · '}
              {t('lastCheck')} {formatLastCheck(versionInfo.last_check, t)}
            </p>
          )}

          {updateResult?.compatible === false && (
            <div className="rounded-md border border-border bg-muted/50 px-3.5 py-3">
              <p className="mb-1 mt-0 text-sm font-bold text-foreground">{t('incompatibleUpdate')}</p>
              <p className="m-0 text-xs text-muted-foreground">
                {updateResult.incompatibleMessage ??
                  t('incompatibleUpdateDesc', { version: updateResult.latestVersion })}
              </p>
            </div>
          )}

          {updateResult?.hasUpdate && (
            <div className="rounded-md border border-primary bg-primary/10 px-3.5 py-3">
              <p className="mb-1 mt-0 text-sm font-bold text-primary">
                {t('updateVersionAvailable', { version: updateResult.latestVersion })}
              </p>
              {updateResult.changelog && (
                <p className="m-0 text-xs text-muted-foreground">{updateResult.changelog}</p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => void onApplyUpdate()}
                disabled={updateStatus === 'updating'}
                className="mt-2.5"
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
            className="self-start"
          >
            {updateStatus === 'checking' ? t('checking') : t('checkForUpdates')}
          </Button>

          {updateMsg && (
            <p
              className={clsx(
                'm-0 text-xs',
                updateStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {updateMsg}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {t('catalog')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          <p className="m-0 text-xs text-muted-foreground">{t('catalogSubtitle')}</p>
          <div className="flex flex-col gap-2">
            {agentDefinitions.map((capability) => (
              <Card key={capability.id} className="border-border/60 bg-muted/40 shadow-none">
                <CardContent className="py-2.5">
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
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border bg-muted text-muted-foreground',
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
