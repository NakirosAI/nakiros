import { useState } from 'react';
import type { StoredRepo, AgentProfile } from '@nakiros/shared';
import { PROFILE_LABELS } from '../utils/profiles';

const PROFILES: AgentProfile[] = [
  'frontend-react',
  'frontend-vue',
  'frontend-angular',
  'backend-node',
  'backend-python',
  'backend-rust',
  'backend-go',
  'mobile-rn',
  'fullstack',
  'generic',
];

interface Props {
  onAdd(repo: StoredRepo): void;
}

export default function AddRepoForm({ onAdd }: Props) {
  const [detecting, setDetecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleClick() {
    setDetecting(true);
    try {
      const localPath = await window.nakiros.selectDirectory();
      if (!localPath) return;

      const profile = await window.nakiros.detectProfile(localPath);
      const name = localPath.split('/').pop() ?? localPath;

      onAdd({
        name,
        localPath,
        role: '',
        profile,
        llmDocs: ['CLAUDE.md'],
      });
      setStatus(`Repo ajouté: ${name} (${PROFILE_LABELS[profile]})`);
      setTimeout(() => setStatus(null), 1800);
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={handleClick}
        disabled={detecting}
        style={{
          padding: '8px 16px',
          background: 'var(--primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          cursor: detecting ? 'not-allowed' : 'pointer',
          opacity: detecting ? 0.65 : 1,
          alignSelf: 'flex-start',
          fontWeight: 700,
        }}
      >
        {detecting ? 'Détection…' : '+ Ajouter un repo'}
      </button>
      {status && <span style={{ fontSize: 12, color: 'var(--success)' }}>{status}</span>}
    </div>
  );
}

export { PROFILES };
