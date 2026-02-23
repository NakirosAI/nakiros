import type { StoredRepo } from '@tiqora/shared';
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
    await window.tiqora.openPath(repo.localPath);
  }

  const color = PROFILE_COLORS[repo.profile];
  const label = PROFILE_LABELS[repo.profile];

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            background: color,
            color: '#fff',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 12,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <strong style={{ fontSize: 15 }}>{repo.name}</strong>
      </div>
      {repo.role && (
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{repo.role}</p>
      )}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: '#9ca3af',
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
          padding: '6px 12px',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
          alignSelf: 'flex-start',
        }}
      >
        Ouvrir
      </button>
    </div>
  );
}
