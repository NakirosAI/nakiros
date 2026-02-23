import { useEffect } from 'react';
import type { StoredWorkspace } from '@tiqora/shared';
import appIcon from '../assets/icon.svg';
import type { ResolvedLanguage } from '@tiqora/shared';
import { Folder, SquarePlus } from 'lucide-react';
import { MESSAGES } from '../i18n';

interface Props {
  recentWorkspaces: StoredWorkspace[];
  onOpenDirectory(): void;
  onNewWorkspace(): void;
  onOpenWorkspace(id: string): void;
  bootError?: string;
  language: ResolvedLanguage;
}

function timeAgo(iso: string, language: ResolvedLanguage): string {
  const msg = MESSAGES[language];
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return msg.home.now;
  if (mins < 60) return msg.home.minutesAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return msg.home.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  return msg.home.daysAgo(days);
}

export default function Home({
  recentWorkspaces,
  onOpenDirectory,
  onNewWorkspace,
  onOpenWorkspace,
  bootError,
  language,
}: Props) {
  const msg = MESSAGES[language];

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'o') {
        event.preventDefault();
        onOpenDirectory();
      }
      if ((event.metaKey || event.ctrlKey) && key === 'n') {
        event.preventDefault();
        onNewWorkspace();
      }
    }

    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [onOpenDirectory, onNewWorkspace]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: '100vh',
        padding: '48px 24px 32px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          background: 'var(--bg-soft)',
          border: '1px solid var(--line)',
          borderRadius: 3,
          boxShadow: 'var(--shadow-sm)',
          padding: '34px 28px 26px',
        }}
      >
        <div style={{ marginBottom: 28, textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={appIcon}
              alt="Logo Tiqora"
              width={44}
              height={44}
              style={{ borderRadius: 12, display: 'block' }}
            />
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 750, letterSpacing: '-0.02em' }}>
              {msg.home.title}
            </h1>
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 15, maxWidth: 520 }}>
            {msg.home.subtitle}
          </p>
        </div>

        {bootError && (
          <div
            style={{
              marginBottom: 16,
              border: '1px solid #f1b5b5',
              background: '#fff3f3',
              color: '#8b1f1f',
              borderRadius: 2,
              padding: '10px 12px',
              fontSize: 13,
            }}
          >
            {bootError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
          <button onClick={onOpenDirectory} style={cardStyle}>
            <span style={{ marginBottom: 10, display: 'block', color: 'var(--text-muted)' }}>
              <Folder size={32} />
            </span>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>
              {msg.home.openWorkspace}
            </strong>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {msg.home.openWorkspaceHint}
            </span>
            <span style={shortcutPill}>Ctrl/Cmd + O</span>
          </button>

          <button
            onClick={onNewWorkspace}
            style={{ ...cardStyle, background: 'var(--primary-soft)', borderColor: 'var(--primary)' }}
          >
            <span style={{ marginBottom: 10, display: 'block', color: 'var(--primary)' }}>
              <SquarePlus size={32} />
            </span>
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>
              {msg.home.createWorkspace}
            </strong>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {msg.home.createWorkspaceHint}
            </span>
            <span style={shortcutPill}>Ctrl/Cmd + N</span>
          </button>
        </div>

        {recentWorkspaces.length > 0 ? (
          <div>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              {msg.home.recent}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentWorkspaces.map((ws) => (
                <button key={ws.id} onClick={() => onOpenWorkspace(ws.id)} style={recentItemStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ws.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {ws.repos.length} repo{ws.repos.length > 1 ? 's' : ''}
                      {ws.pmTool ? ` · ${ws.pmTool}${ws.projectKey ? ` ${ws.projectKey}` : ''}` : ''}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {timeAgo(ws.lastOpenedAt, language)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              border: '1px dashed var(--line-strong)',
              borderRadius: 2,
              padding: '14px 16px',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            {msg.home.noRecent}
          </div>
        )}
      </div>
    </div>
  );
}

const shortcutPill: React.CSSProperties = {
  marginTop: 12,
  marginLeft: 5,
  display: 'inline-block',
  border: '1px solid var(--line-strong)',
  color: 'var(--text-muted)',
  borderRadius: 2,
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 600,
};

const cardStyle: React.CSSProperties = {
  width: 236,
  padding: '22px 18px 18px',
  background: 'var(--bg-soft)',
  border: '1.5px solid var(--line)',
  borderRadius: 3,
  cursor: 'pointer',
  textAlign: 'left',
};

const recentItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px',
  background: 'var(--bg-soft)',
  border: '1px solid var(--line)',
  borderRadius: 2,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  boxSizing: 'border-box',
};

function actionIconStyle(): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    stroke: 'currentColor',
    strokeWidth: 1.9,
    fill: 'none',
  };
}

function OpenWorkspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" style={actionIconStyle()} aria-hidden="true">
      <path d="M3.5 7.5h6.5l2-2h8v12h-16.5z" />
      <path d="M3.5 11.5h16.5" />
    </svg>
  );
}

function CreateWorkspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" style={actionIconStyle()} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}
