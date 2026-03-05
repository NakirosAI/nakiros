import { useEffect, useRef, useState } from 'react';
import { Bot, Languages, Plug, Sparkles, X } from 'lucide-react';
import type {
  AgentProvider,
  AppPreferences,
  LanguagePreference,
  ResolvedLanguage,
  ResolvedTheme,
  ThemePreference,
} from '@nakiros/shared';
import { MESSAGES } from '../i18n';

interface Props {
  preferences: AppPreferences;
  resolvedTheme: ResolvedTheme;
  language: ResolvedLanguage;
  onChange(next: AppPreferences): Promise<void>;
  onClose(): void;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';
type UpdateStatus = 'idle' | 'checking' | 'updating' | 'success' | 'error';
type AgentCliStatus = {
  provider: 'claude' | 'codex' | 'cursor';
  label: string;
  command: string;
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
};
type SettingsSection = 'general' | 'agent-ai' | 'mcp-nakiros' | 'agent-nakiros';
type NakirosCapabilityKind = 'agent' | 'workflow';
type NakirosCapability = { id: string; label: string; command: string; kind: NakirosCapabilityKind };

const NAKIROS_CAPABILITIES: NakirosCapability[] = [
  { id: 'agent-nakiros', label: 'Nakiros', command: '/nak-agent-nakiros', kind: 'agent' },
  { id: 'agent-dev', label: 'Dev Agent', command: '/nak-agent-dev', kind: 'agent' },
  { id: 'agent-pm', label: 'PM Agent', command: '/nak-agent-pm', kind: 'agent' },
  { id: 'agent-architect', label: 'Architect', command: '/nak-agent-architect', kind: 'agent' },
  { id: 'agent-sm', label: 'SM Agent', command: '/nak-agent-sm', kind: 'agent' },
  { id: 'agent-qa', label: 'QA Agent', command: '/nak-agent-qa', kind: 'agent' },
  { id: 'agent-hotfix', label: 'Hotfix Agent', command: '/nak-agent-hotfix', kind: 'agent' },
  { id: 'agent-brainstorming', label: 'Brainstorming', command: '/nak-agent-brainstorming', kind: 'agent' },
  { id: 'workflow-dev-story', label: 'Dev Story', command: '/nak-workflow-dev-story', kind: 'workflow' },
  { id: 'workflow-create-story', label: 'Create Story', command: '/nak-workflow-create-story', kind: 'workflow' },
  { id: 'workflow-create-ticket', label: 'Create Ticket', command: '/nak-workflow-create-ticket', kind: 'workflow' },
  { id: 'workflow-generate-context', label: 'Generate Context', command: '/nak-workflow-generate-context', kind: 'workflow' },
  { id: 'workflow-fetch-project-context', label: 'Fetch Project Context', command: '/nak-workflow-fetch-project-context', kind: 'workflow' },
  { id: 'workflow-qa-review', label: 'QA Review', command: '/nak-workflow-qa-review', kind: 'workflow' },
  { id: 'workflow-project-confidence', label: 'Project Confidence', command: '/nak-workflow-project-understanding-confidence', kind: 'workflow' },
  { id: 'workflow-hotfix-story', label: 'Hotfix Story', command: '/nak-workflow-hotfix-story', kind: 'workflow' },
  { id: 'workflow-sprint-planning', label: 'Sprint Planning', command: '/nak-workflow-sprint', kind: 'workflow' },
];

export default function GlobalSettings({
  preferences,
  resolvedTheme,
  language,
  onChange,
  onClose,
}: Props) {
  const msg = MESSAGES[language];
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<number | null>(null);
  const [cliInfo, setCliInfo] = useState<AgentCliStatus[] | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateMsg, setUpdateMsg] = useState<string>('');
  const [versionInfo, setVersionInfo] = useState<BundleVersionInfo | null>(null);
  const [section, setSection] = useState<SettingsSection>('general');
  const [mcpServerInput, setMcpServerInput] = useState(preferences.mcpServerUrl ?? '');
  const isFr = language === 'fr';

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
    setMcpServerInput(preferences.mcpServerUrl ?? '');
  }, [preferences.mcpServerUrl]);

  async function handleCheckUpdates(channelOverride?: 'stable' | 'beta') {
    setUpdateStatus('checking');
    setUpdateMsg('');
    setUpdateResult(null);
    try {
      const channel = channelOverride ?? preferences.agentChannel ?? 'stable';
      const result = await window.nakiros.checkForUpdates(true, channel);
      setUpdateResult(result);
      setUpdateStatus(result.hasUpdate || !result.compatible ? 'idle' : 'success');
      if (!result.hasUpdate && result.compatible) setUpdateMsg(isFr ? 'Agents et workflows à jour.' : 'Agents and workflows are up to date.');
    } catch {
      setUpdateStatus('error');
      setUpdateMsg(isFr ? 'Impossible de vérifier les mises à jour.' : 'Unable to check updates.');
    }
  }

  async function handleApplyUpdate() {
    if (!updateResult?.changedFiles.length) return;
    setUpdateStatus('updating');
    try {
      await window.nakiros.applyUpdate(updateResult.changedFiles, updateResult.latestVersion);
      setUpdateStatus('success');
      setUpdateMsg(isFr ? `✅ Mis à jour vers ${updateResult.latestVersion}` : `✅ Updated to ${updateResult.latestVersion}`);
      setUpdateResult(null);
    } catch {
      setUpdateStatus('error');
      setUpdateMsg(isFr ? 'Erreur lors de la mise à jour.' : 'Update failed.');
    }
  }

  async function update(partial: Partial<AppPreferences>) {
    setStatus('saving');
    try {
      await onChange({ ...preferences, ...partial });
      setStatus('saved');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
    }
  }

  async function handleMcpServerBlur() {
    const trimmed = mcpServerInput.trim();
    const nextValue = trimmed || undefined;
    if ((preferences.mcpServerUrl || undefined) === nextValue) return;
    await update({ mcpServerUrl: nextValue });
  }

  const statusText =
    status === 'saved' ? msg.settings.saveSuccess
      : status === 'error' ? msg.settings.saveError
        : '';
  const providerAvailability = new Map((cliInfo ?? []).map((entry) => [entry.provider, entry.installed]));
  const selectedProvider = preferences.agentProvider ?? 'claude';
  const selectedProviderMissing = cliInfo != null && providerAvailability.get(selectedProvider) === false;
  const nav = [
    { id: 'general' as const, label: msg.settings.navGeneral, icon: <Languages size={15} /> },
    { id: 'agent-ai' as const, label: isFr ? 'Agent AI' : 'AI Agent', icon: <Bot size={15} /> },
    { id: 'mcp-nakiros' as const, label: isFr ? 'MCP Nakiros' : 'Nakiros MCP', icon: <Plug size={15} /> },
    { id: 'agent-nakiros' as const, label: isFr ? 'Agent Nakiros' : 'Nakiros Agent', icon: <Sparkles size={15} /> },
  ];

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <nav
        style={{
          width: 170,
          background: 'var(--bg-soft)',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 8px',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              border: section === item.id ? '1px solid var(--primary)' : '1px solid transparent',
              borderRadius: 10,
              background: section === item.id ? 'var(--primary-soft)' : 'transparent',
              color: section === item.id ? 'var(--primary)' : 'var(--text)',
              fontWeight: section === item.id ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ opacity: section === item.id ? 1 : 0.6, flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <button
                onClick={onClose}
                title={isFr ? 'Fermer (Esc)' : 'Close (Esc)'}
                aria-label={isFr ? 'Fermer les paramètres globaux' : 'Close global settings'}
                style={closeButton}
              >
                <X size={14} />
              </button>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>Esc</span>
            </div>
          </div>

          {section === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={h2Style}>{msg.settings.navGeneral}</h2>
                <p style={subtitleStyle}>{msg.settings.subtitle}</p>
                {statusText && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {statusText}
                  </p>
                )}
              </div>

              <section style={sectionStyle}>
                <label style={fieldLabel}>{msg.settings.languageTitle}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    ['system', msg.settings.languageSystem],
                    ['fr', msg.settings.languageFrench],
                    ['en', msg.settings.languageEnglish],
                  ] as [LanguagePreference, string][]).map(([value, label]) => (
                    <button key={value} onClick={() => void update({ language: value })} style={chipStyle(preferences.language === value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section style={sectionStyle}>
                <label style={fieldLabel}>{msg.settings.appearanceTitle}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    ['system', msg.settings.themeSystem],
                    ['light', msg.settings.themeLight],
                    ['dark', msg.settings.themeDark],
                  ] as [ThemePreference, string][]).map(([value, label]) => (
                    <button key={value} onClick={() => void update({ theme: value })} style={chipStyle(preferences.theme === value)}>
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ ...hintStyle, marginTop: 8 }}>{msg.settings.resolvedTheme(resolvedTheme)}</p>
              </section>
            </div>
          )}

          {section === 'agent-ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={h2Style}>{isFr ? 'Agent AI' : 'AI Agent'}</h2>
                <p style={subtitleStyle}>
                  {isFr
                    ? 'Choix du provider par défaut et CLIs détectés regroupés sur un seul écran.'
                    : 'Default provider and detected CLIs are grouped in one section.'}
                </p>
                {statusText && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {statusText}
                  </p>
                )}
              </div>

              <section style={sectionStyle}>
                <label style={fieldLabel}>{msg.settings.agentProviderTitle}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    ['claude', msg.settings.agentProviderClaude],
                    ['codex', msg.settings.agentProviderCodex],
                    ['cursor', msg.settings.agentProviderCursor],
                  ] as [AgentProvider, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => void update({ agentProvider: value })}
                      disabled={cliInfo != null && providerAvailability.get(value) === false}
                      style={{
                        ...chipStyle((preferences.agentProvider ?? 'claude') === value),
                        ...(cliInfo != null && providerAvailability.get(value) === false
                          ? { opacity: 0.45, cursor: 'not-allowed' as const }
                          : {}),
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {selectedProviderMissing && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>
                    {msg.settings.agentCliStatusMissingWarning}
                  </p>
                )}

                <div style={{ marginTop: 14 }}>
                  <label style={fieldLabel}>{msg.settings.agentCliStatusTitle}</label>
                  {cliLoading && (
                    <p style={hintStyle}>{msg.settings.agentCliStatusChecking}</p>
                  )}
                  {!cliLoading && cliInfo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {cliInfo.map((entry) => (
                        <div
                          key={entry.provider}
                          style={{
                            border: '1px solid var(--line)',
                            borderRadius: 10,
                            background: 'var(--bg-card)',
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: 13 }}>{entry.label}</strong>
                            <span style={{ fontSize: 11, color: entry.installed ? 'var(--text-muted)' : 'var(--danger)' }}>
                              {entry.installed ? msg.settings.envDetected : msg.settings.envNotDetected}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {entry.command}
                            {' · '}
                            {entry.version ?? msg.settings.agentCliStatusVersionUnknown}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {section === 'mcp-nakiros' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={h2Style}>{isFr ? 'MCP Nakiros' : 'Nakiros MCP'}</h2>
                <p style={subtitleStyle}>
                  {isFr
                    ? "Configuration de l'URL MCP utilisée pour connecter les workspaces et les agents."
                    : 'Configure the MCP URL used to connect workspaces and agents.'}
                </p>
                {statusText && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {statusText}
                  </p>
                )}
              </div>

              <section style={sectionStyle}>
                <label style={fieldLabel}>{msg.settings.mcpServerLabel}</label>
                <input
                  type="text"
                  placeholder={msg.settings.mcpServerPlaceholder}
                  value={mcpServerInput}
                  onChange={(e) => setMcpServerInput(e.target.value)}
                  onBlur={() => void handleMcpServerBlur()}
                  style={inputStyle}
                />
                <p style={{ ...hintStyle, marginTop: 8 }}>
                  {msg.settings.mcpServerHint}
                </p>
              </section>
            </div>
          )}

          {section === 'agent-nakiros' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={h2Style}>{isFr ? 'Agent Nakiros' : 'Nakiros Agent'}</h2>
                <p style={subtitleStyle}>
                  {isFr
                    ? 'Mises à jour et catalogue des agents et workflows Nakiros.'
                    : 'Updates and catalog of Nakiros agents and workflows.'}
                </p>
              </div>

              <section style={sectionStyle}>
                <label style={fieldLabel}>Agents &amp; Workflows</label>

                {versionInfo && (
                  <p style={{ ...hintStyle, marginBottom: 14 }}>
                    {isFr ? 'Version installée :' : 'Installed version:'}{' '}
                    <strong style={{ color: 'var(--text)' }}>{versionInfo.bundle_version}</strong>
                    {' · '}
                    {isFr ? 'Dernière vérification :' : 'Last check:'}{' '}
                    {formatLastCheck(versionInfo.last_check, isFr)}
                  </p>
                )}

                {updateResult?.compatible === false && (
                  <div style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 10 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {isFr ? 'Mise à jour incompatible' : 'Incompatible update'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                      {updateResult.incompatibleMessage ?? (isFr
                        ? `Cette version nécessite une mise à jour de l'application Nakiros (v${updateResult.latestVersion}).`
                        : `This version requires a Nakiros app update (v${updateResult.latestVersion}).`)}
                    </p>
                  </div>
                )}

                {updateResult?.hasUpdate && (
                  <div style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 10 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                      {isFr ? `Version ${updateResult.latestVersion} disponible` : `Version ${updateResult.latestVersion} available`}
                    </p>
                    {updateResult.changelog && (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{updateResult.changelog}</p>
                    )}
                    <button
                      onClick={() => void handleApplyUpdate()}
                      disabled={updateStatus === 'updating'}
                      style={{ ...chipStyle(true), marginTop: 10, border: 'none', opacity: updateStatus === 'updating' ? 0.6 : 1 }}
                    >
                      {updateStatus === 'updating'
                        ? (isFr ? 'Mise à jour…' : 'Updating…')
                        : (isFr ? 'Mettre à jour maintenant' : 'Update now')}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => void handleCheckUpdates()}
                  disabled={updateStatus === 'checking' || updateStatus === 'updating'}
                  style={{
                    ...secondaryBtn,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: updateStatus === 'checking' ? 'default' : 'pointer',
                    opacity: updateStatus === 'checking' || updateStatus === 'updating' ? 0.6 : 1,
                  }}
                >
                  {updateStatus === 'checking'
                    ? (isFr ? 'Vérification…' : 'Checking…')
                    : (isFr ? 'Vérifier les mises à jour' : 'Check for updates')}
                </button>
                {updateMsg && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: updateStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {updateMsg}
                  </p>
                )}
              </section>

              <section style={sectionStyle}>
                <label style={fieldLabel}>{isFr ? 'Catalogue' : 'Catalog'}</label>
                <p style={hintStyle}>
                  {isFr
                    ? 'Commandes disponibles pour orchestrer les agents et workflows Nakiros.'
                    : 'Available commands to orchestrate Nakiros agents and workflows.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {NAKIROS_CAPABILITIES.map((capability) => (
                    <div
                      key={capability.id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 10,
                        background: 'var(--bg-card)',
                        padding: '8px 10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong style={{ fontSize: 13 }}>{capability.label}</strong>
                        </div>
                        <code style={{ fontSize: 11 }}>{capability.command}</code>
                      </div>
                      <span style={kindBadge(capability.kind)}>
                        {capability.kind === 'agent' ? 'Agent' : 'Workflow'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const h2Style: React.CSSProperties = { margin: '0 0 4px', fontSize: 20, fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-muted)' };
const sectionStyle: React.CSSProperties = { border: '1px solid var(--line)', background: 'var(--bg-soft)', borderRadius: 10, padding: 16 };
const fieldLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };
const hintStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: 'var(--text-muted)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
const secondaryBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--text)', fontWeight: 600, fontSize: 13 };
const closeButton: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
};


function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 11px',
    borderRadius: 10,
    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
    background: active ? 'var(--primary-soft)' : 'var(--bg-soft)',
    color: active ? 'var(--primary)' : 'var(--text)',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };
}


function formatLastCheck(iso: string, isFr: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return isFr ? `il y a ${days}j` : `${days}d ago`;
  if (hours > 0) return isFr ? `il y a ${hours}h` : `${hours}h ago`;
  if (minutes > 0) return isFr ? `il y a ${minutes}min` : `${minutes}m ago`;
  return isFr ? "à l'instant" : 'just now';
}

function kindBadge(kind: NakirosCapabilityKind): React.CSSProperties {
  if (kind === 'agent') {
    return {
      fontSize: 10,
      fontWeight: 700,
      color: '#1d4ed8',
      background: '#dbeafe',
      border: '1px solid #3b82f6',
      borderRadius: 10,
      padding: '1px 6px',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      flexShrink: 0,
    };
  }
  return {
    fontSize: 10,
    fontWeight: 700,
    color: '#6d28d9',
    background: '#ede9fe',
    border: '1px solid #8b5cf6',
    borderRadius: 10,
    padding: '1px 6px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flexShrink: 0,
  };
}
