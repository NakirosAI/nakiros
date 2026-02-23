import type { StoredWorkspace } from '@tiqora/shared';

interface Props {
  recentWorkspaces: StoredWorkspace[];
  onOpenDirectory(): void;
  onNewWorkspace(): void;
  onOpenWorkspace(id: string): void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export default function Home({ recentWorkspaces, onOpenDirectory, onNewWorkspace, onOpenWorkspace }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '40px 24px',
        boxSizing: 'border-box',
        background: '#f9fafb',
      }}
    >
      {/* Title */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px' }}>
          Tiqora
        </h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 15 }}>
          Orchestrateur d'agents IA multi-repo
        </p>
      </div>

      {/* Two big action cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 48 }}>
        <button
          onClick={onOpenDirectory}
          style={cardStyle}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHover)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}
        >
          <span style={{ fontSize: 36, marginBottom: 12, display: 'block' }}>📂</span>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>
            Ouvrir un workspace
          </strong>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Sélectionner un dossier existant
          </span>
        </button>

        <button
          onClick={onNewWorkspace}
          style={{ ...cardStyle, borderColor: '#0070f3' }}
          onMouseEnter={(e) =>
            Object.assign(e.currentTarget.style, { ...cardHover, borderColor: '#0070f3', background: '#eff6ff' })
          }
          onMouseLeave={(e) =>
            Object.assign(e.currentTarget.style, { ...cardStyle, borderColor: '#0070f3' })
          }
        >
          <span style={{ fontSize: 36, marginBottom: 12, display: 'block' }}>✨</span>
          <strong style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>
            Créer un workspace
          </strong>
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            Configurer un nouveau projet
          </span>
        </button>
      </div>

      {/* Recent workspaces */}
      {recentWorkspaces.length > 0 && (
        <div style={{ width: '100%', maxWidth: 480 }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#9ca3af',
            }}
          >
            Récents
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => onOpenWorkspace(ws.id)}
                style={recentItemStyle}
                onMouseEnter={(e) => Object.assign(e.currentTarget.style, recentItemHover)}
                onMouseLeave={(e) => Object.assign(e.currentTarget.style, recentItemStyle)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{ws.name}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {ws.repos.length} repo{ws.repos.length > 1 ? 's' : ''}
                    {ws.pmTool ? ` · ${ws.pmTool}${ws.projectKey ? ` ${ws.projectKey}` : ''}` : ''}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  {timeAgo(ws.lastOpenedAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  width: 200,
  padding: '28px 20px',
  background: '#fff',
  border: '1.5px solid #e5e7eb',
  borderRadius: 12,
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.15s',
};

const cardHover: React.CSSProperties = {
  ...cardStyle,
  background: '#f9fafb',
  borderColor: '#d1d5db',
  transform: 'translateY(-2px)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

const recentItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  boxSizing: 'border-box',
};

const recentItemHover: React.CSSProperties = {
  ...recentItemStyle,
  background: '#f3f4f6',
};
