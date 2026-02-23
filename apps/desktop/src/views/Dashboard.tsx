import type { StoredWorkspace } from '@tiqora/shared';
import RepoCard from '../components/RepoCard';

interface Props {
  workspace: StoredWorkspace;
  allWorkspaces: StoredWorkspace[];
  onSwitchWorkspace(id: string): void;
  onNewWorkspace(): void;
  onGoHome(): void;
}

export default function Dashboard({ workspace, allWorkspaces, onSwitchWorkspace, onNewWorkspace, onGoHome }: Props) {
  return (
    <div style={{ padding: 32 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {allWorkspaces.length > 1 ? (
            <select
              value={workspace.id}
              onChange={(e) => onSwitchWorkspace(e.target.value)}
              style={{
                fontSize: 20,
                fontWeight: 700,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              {allWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 style={{ margin: 0, fontSize: 24 }}>{workspace.name}</h1>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onGoHome}
            style={{
              padding: '8px 14px',
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ⌂ Accueil
          </button>
          <button
            onClick={onNewWorkspace}
            style={{
              padding: '8px 16px',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Nouveau workspace
          </button>
        </div>
      </div>

      {workspace.repos.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucun repo dans ce workspace.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {workspace.repos.map((repo) => (
            <RepoCard key={repo.localPath} repo={repo} />
          ))}
        </div>
      )}
    </div>
  );
}
