import type { StoredRepo } from '@nakiros/shared';
import { PROFILE_COLORS, PROFILE_LABELS } from '../utils/profiles';

interface Props {
  repo: StoredRepo;
}

function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return '…' + path.slice(-(maxLen - 1));
}

export default function RepoCard({ repo }: Props) {
  async function handleOpen() {
    await window.nakiros.openPath(repo.localPath);
  }

  const color = PROFILE_COLORS[repo.profile];
  const label = PROFILE_LABELS[repo.profile];

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'var(--bg-soft)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            background: color,
            color: '#fff',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 10,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <strong style={{ fontSize: 15 }}>{repo.name}</strong>
      </div>
      {repo.role && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{repo.role}</p>
      )}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
        }}
        title={repo.localPath}
      >
        {truncatePath(repo.localPath)}
      </p>
      <button
        onClick={handleOpen}
        style={{
          marginTop: 4,
          padding: '7px 12px',
          background: 'var(--bg-muted)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          cursor: 'pointer',
          fontSize: 13,
          alignSelf: 'flex-start',
          fontWeight: 600,
        }}
      >
        Ouvrir
      </button>
    </div>
  );
}
