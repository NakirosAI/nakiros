import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Building2, KeyRound, Languages, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import type { AppPreferences } from '@nakiros/shared';
import { Button } from './ui';
import { usePreferences } from '../hooks/usePreferences';
import { AGENT_DEFINITIONS, resolveAgentDefinitions, type AgentDefinition } from '../constants/agents';
import { SettingsOrganization } from './settings';
import {
  GlobalSettingsAgentAISection,
  GlobalSettingsAgentNakirosSection,
  GlobalSettingsGeneralSection,
  GlobalSettingsProviderCredentialsSection,
  type AgentCliStatus,
  type GlobalSettingsStatus,
  type GlobalSettingsUpdateStatus,
} from './settings/GlobalSettingsSections';

interface Props {
  onClose(): void;
  initialSection?: SettingsSection;
  onUpdateApplied?(): void;
}

type SettingsSection =
  | 'general'
  | 'organization'
  | 'provider-credentials'
  | 'agent-ai'
  | 'agent-nakiros';

export type GlobalSettingsSection = SettingsSection;

export default function GlobalSettings({ onClose, initialSection = 'general', onUpdateApplied }: Props) {
  const { t } = useTranslation('settings');
  const { preferences, updatePreferences } = usePreferences();
  const [status, setStatus] = useState<GlobalSettingsStatus>('idle');
  const timerRef = useRef<number | null>(null);
  const [cliInfo, setCliInfo] = useState<AgentCliStatus[] | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateStatus, setUpdateStatus] = useState<GlobalSettingsUpdateStatus>('idle');
  const [updateMsg, setUpdateMsg] = useState('');
  const [versionInfo, setVersionInfo] = useState<BundleVersionInfo | null>(null);
  const [agentDefinitions, setAgentDefinitions] = useState<AgentDefinition[]>(AGENT_DEFINITIONS);
  const [section, setSection] = useState<SettingsSection>(initialSection);

  useEffect(() => {
    setCliLoading(true);
    void window.nakiros.getAgentCliStatus().then((info) => {
      setCliInfo(info);
    }).finally(() => setCliLoading(false));
  }, []);

  useEffect(() => {
    void window.nakiros.getVersionInfo().then(setVersionInfo);
  }, []);

  useEffect(() => {
    void handleCheckUpdates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.nakiros.getInstalledCommands()
      .then((commands) => {
        if (cancelled) return;
        setAgentDefinitions(resolveAgentDefinitions(commands));
      })
      .catch(() => {
        if (cancelled) return;
        setAgentDefinitions(AGENT_DEFINITIONS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onClose]);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  async function handleCheckUpdates(channelOverride?: 'stable' | 'beta') {
    setUpdateStatus('checking');
    setUpdateMsg('');
    setUpdateResult(null);
    try {
      const channel = channelOverride ?? preferences.agentChannel ?? 'stable';
      const result = await window.nakiros.checkForUpdates(true, channel);
      setUpdateResult(result);
      setUpdateStatus(result.hasUpdate || !result.compatible ? 'idle' : 'success');
      if (!result.hasUpdate && result.compatible) setUpdateMsg(t('agentsUpToDate'));
    } catch {
      setUpdateStatus('error');
      setUpdateMsg(t('unableToCheckUpdates'));
    }
  }

  async function handleApplyUpdate() {
    if (!updateResult?.changedFiles.length) return;
    setUpdateStatus('updating');
    try {
      await window.nakiros.applyUpdate(updateResult.changedFiles, updateResult.latestVersion);
      const [nextVersionInfo, installedCommands] = await Promise.all([
        window.nakiros.getVersionInfo(),
        window.nakiros.getInstalledCommands(),
      ]);
      setVersionInfo(nextVersionInfo);
      setAgentDefinitions(resolveAgentDefinitions(installedCommands));
      setUpdateStatus('success');
      setUpdateMsg(t('updatedTo', { version: updateResult.latestVersion }));
      setUpdateResult(null);
      onUpdateApplied?.();
    } catch {
      setUpdateStatus('error');
      setUpdateMsg(t('updateFailed'));
    }
  }

  async function update(partial: Partial<AppPreferences>) {
    setStatus('saving');
    try {
      await updatePreferences({ ...preferences, ...partial });
      setStatus('saved');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
    }
  }

  const statusText =
    status === 'saved' ? t('saveSuccess')
      : status === 'error' ? t('saveError')
        : '';

  const providerAvailability = new Map((cliInfo ?? []).map((entry) => [entry.provider, entry.installed]));
  const selectedProvider = preferences.agentProvider ?? 'claude';
  const selectedProviderMissing = cliInfo != null && providerAvailability.get(selectedProvider) === false;

  const nav = [
    { id: 'general' as const, label: t('navGeneral'), icon: <Languages size={15} /> },
    { id: 'organization' as const, label: t('navOrganization'), icon: <Building2 size={15} /> },
    { id: 'provider-credentials' as const, label: t('navProviderCredentials'), icon: <KeyRound size={15} /> },
    { id: 'agent-ai' as const, label: t('navAgentAI'), icon: <Bot size={15} /> },
    { id: 'agent-nakiros' as const, label: t('navAgentNakiros'), icon: <Sparkles size={15} /> },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <nav className="flex w-[170px] shrink-0 flex-col gap-0.5 border-r border-[var(--line)] bg-[var(--bg-soft)] p-[10px_8px]">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={clsx(
              'flex w-full items-center gap-2 rounded-[10px] border px-[10px] py-2 text-left text-[13px]',
              section === item.id
                ? 'border-[var(--primary)] bg-[var(--primary-soft)] font-bold text-[var(--primary)]'
                : 'border-transparent font-medium text-[var(--text)]',
            )}
          >
            <span className={clsx('shrink-0', section === item.id ? 'opacity-100' : 'opacity-60')}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="w-full min-w-0">
          <div className="mb-2.5 flex justify-end">
            <div className="flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                title={t('closeSettings')}
                aria-label={t('closeSettingsAriaLabel')}
                className="h-7 w-7 rounded-[10px] border-[var(--line)] bg-[var(--bg-card)] p-0 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </Button>
              <span className="text-[10px] leading-none text-[var(--text-muted)]">Esc</span>
            </div>
          </div>

          {section === 'general' && (
            <GlobalSettingsGeneralSection
              preferences={preferences}
              status={status}
              statusText={statusText}
              onUpdate={update}
            />
          )}

          {section === 'organization' && (
            <SettingsOrganization />
          )}

          {section === 'provider-credentials' && (
            <GlobalSettingsProviderCredentialsSection isActive={section === 'provider-credentials'} />
          )}

          {section === 'agent-ai' && (
            <GlobalSettingsAgentAISection
              preferences={preferences}
              status={status}
              statusText={statusText}
              cliInfo={cliInfo}
              cliLoading={cliLoading}
              providerAvailability={providerAvailability}
              selectedProviderMissing={selectedProviderMissing}
              onUpdate={update}
            />
          )}

          {section === 'agent-nakiros' && (
            <GlobalSettingsAgentNakirosSection
              versionInfo={versionInfo}
              agentDefinitions={agentDefinitions}
              updateResult={updateResult}
              updateStatus={updateStatus}
              updateMsg={updateMsg}
              onApplyUpdate={handleApplyUpdate}
              onCheckUpdates={handleCheckUpdates}
            />
          )}
        </div>
      </div>
    </div>
  );
}
