import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type {
  AgentProvider,
  AppPreferences,
  LanguagePreference,
  ResolvedLanguage,
  ResolvedTheme,
  ThemePreference,
} from '@tiqora/shared';
import { MESSAGES } from '../i18n';

interface Props {
  preferences: AppPreferences;
  resolvedTheme: ResolvedTheme;
  language: ResolvedLanguage;
  onChange(next: AppPreferences): Promise<void>;
  onClose(): void;
}

type Status = 'idle' | 'saving' | 'saved' | 'error';
type GlobalStatus = 'idle' | 'loading' | 'installing' | 'success' | 'error';
type GlobalInstallStatus = {
  environments: Array<{
    id: 'claude' | 'codex' | 'cursor';
    label: string;
    targetDir: string;
    installed: number;
    total: number;
  }>;
  totalInstalled: number;
  totalExpected: number;
};
type AgentCliStatus = {
  provider: 'claude' | 'codex' | 'cursor';
  label: string;
  command: string;
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
};

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
  const [globalInfo, setGlobalInfo] = useState<GlobalInstallStatus | null>(null);
  const [globalStatus, setGlobalStatus] = useState<GlobalStatus>('idle');
  const [globalMsg, setGlobalMsg] = useState<string>('');
  const [cliInfo, setCliInfo] = useState<AgentCliStatus[] | null>(null);
  const [cliLoading, setCliLoading] = useState(false);

  useEffect(() => {
    setGlobalStatus('loading');
    void window.tiqora.getGlobalInstallStatus().then((info) => {
      setGlobalInfo(info);
      setGlobalStatus('idle');
    }).catch(() => setGlobalStatus('idle'));
  }, []);

  useEffect(() => {
    setCliLoading(true);
    void window.tiqora.getAgentCliStatus().then((info) => {
      setCliInfo(info);
    }).finally(() => setCliLoading(false));
  }, []);

  async function handleInstallGlobal() {
    setGlobalStatus('installing');
    setGlobalMsg('');
    try {
      const r = await window.tiqora.installAgentsGlobal();
      setGlobalInfo(await window.tiqora.getGlobalInstallStatus());
      setGlobalMsg(msg.settings.globalAgentsSuccess(r.commandFilesCopied, r.commandFilesOverwritten));
      setGlobalStatus('success');
    } catch {
      setGlobalMsg(msg.settings.globalAgentsError);
      setGlobalStatus('error');
    }
  }
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

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

  const statusText =
    status === 'saved' ? msg.settings.saveSuccess
      : status === 'error' ? msg.settings.saveError
        : '';
  const providerAvailability = new Map((cliInfo ?? []).map((entry) => [entry.provider, entry.installed]));
  const selectedProvider = preferences.agentProvider ?? 'claude';
  const selectedProviderMissing = cliInfo != null && providerAvailability.get(selectedProvider) === false;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 57,
        right: 12,
        width: 320,
        background: 'var(--bg-card)',
        border: '1px solid var(--line)',
        borderRadius: 2,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 500,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>{msg.settings.title}</span>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            padding: '2px 4px',
          }}
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Appearance */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.appearanceTitle}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              ['system', msg.settings.themeSystem],
              ['light', msg.settings.themeLight],
              ['dark', msg.settings.themeDark],
            ] as [ThemePreference, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void update({ theme: value })}
                style={chipStyle(preferences.theme === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            {msg.settings.resolvedTheme(resolvedTheme)}
          </p>
        </section>

        {/* Language */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.languageTitle}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              ['system', msg.settings.languageSystem],
              ['fr', msg.settings.languageFrench],
              ['en', msg.settings.languageEnglish],
            ] as [LanguagePreference, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void update({ language: value })}
                style={chipStyle(preferences.language === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Agent provider */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.agentProviderTitle}</h3>
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
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--danger)' }}>
              {msg.settings.agentCliStatusMissingWarning}
            </p>
          )}
        </section>

        {/* CLI status */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.agentCliStatusTitle}</h3>
          {cliLoading && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              {msg.settings.agentCliStatusChecking}
            </p>
          )}
          {!cliLoading && cliInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cliInfo.map((entry) => (
                <p key={entry.provider} style={{ margin: 0, fontSize: 11, color: entry.installed ? 'var(--text-muted)' : 'var(--danger)', fontFamily: 'monospace' }}>
                  {entry.label}: {entry.installed ? msg.settings.envDetected : msg.settings.envNotDetected}
                  {' · '}
                  {entry.version ?? msg.settings.agentCliStatusVersionUnknown}
                </p>
              ))}
            </div>
          )}
        </section>

        {/* MCP Server */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.mcpServerTitle}</h3>
          <input
            type="text"
            placeholder={msg.settings.mcpServerPlaceholder}
            defaultValue={preferences.mcpServerUrl ?? ''}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              void update({ mcpServerUrl: val || undefined });
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid var(--line)',
              borderRadius: 2,
              background: 'var(--bg-soft)',
              color: 'var(--text)',
              fontSize: 12,
              boxSizing: 'border-box',
            }}
          />
          <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            {msg.settings.mcpServerHint}
          </p>
        </section>

        {/* Global CLI commands */}
        <section>
          <h3 style={sectionTitle}>{msg.settings.globalAgentsTitle}</h3>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {msg.settings.globalAgentsSubtitle}
          </p>
          {globalInfo && (
            <div style={{ margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ margin: 0, fontSize: 11, color: globalInfo.totalInstalled === globalInfo.totalExpected ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}>
                {msg.settings.globalAgentsStatus(globalInfo.totalInstalled, globalInfo.totalExpected)}
              </p>
              {globalInfo.environments.map((env) => (
                <p key={env.id} style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {env.label}: {env.installed}/{env.total} · {env.targetDir}
                </p>
              ))}
            </div>
          )}
          <button
            onClick={() => void handleInstallGlobal()}
            disabled={globalStatus === 'installing' || globalStatus === 'loading'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 2,
              cursor: globalStatus === 'installing' || globalStatus === 'loading' ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              opacity: globalStatus === 'installing' || globalStatus === 'loading' ? 0.6 : 1,
            }}
          >
            <Download size={13} />
            {globalStatus === 'installing' ? msg.settings.globalAgentsInstalling : msg.settings.globalAgentsInstallAction}
          </button>
          {globalMsg && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: globalStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
              {globalMsg}
            </p>
          )}
        </section>

        {statusText && (
          <p style={{ margin: 0, fontSize: 11, color: status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
            {statusText}
          </p>
        )}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 2,
    border: `1px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
    background: active ? 'var(--primary-soft)' : 'var(--bg-soft)',
    color: active ? 'var(--primary)' : 'var(--text)',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };
}
