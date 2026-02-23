import { useState } from 'react';
import type { StoredRepo, AgentProfile } from '@tiqora/shared';
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

  async function handleClick() {
    setDetecting(true);
    try {
      const localPath = await window.tiqora.selectDirectory();
      if (!localPath) return;

      const profile = await window.tiqora.detectProfile(localPath);
      const name = localPath.split('/').pop() ?? localPath;

      onAdd({
        name,
        localPath,
        role: '',
        profile,
        llmDocs: ['CLAUDE.md'],
      });
    } finally {
      setDetecting(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={detecting}
      style={{
        padding: '8px 16px',
        background: '#0070f3',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: detecting ? 'not-allowed' : 'pointer',
        opacity: detecting ? 0.6 : 1,
      }}
    >
      {detecting ? 'Détection…' : '+ Ajouter un repo'}
    </button>
  );
}

export { PROFILES };
