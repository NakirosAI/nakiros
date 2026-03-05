import { useState } from 'react';
import type { AgentProfile, StoredRepo } from '@nakiros/shared';
import clsx from 'clsx';
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
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={detecting}
        className={clsx(
          'self-start rounded-[10px] border-none px-4 py-2 font-bold text-white',
          detecting ? 'cursor-not-allowed bg-[var(--primary)] opacity-65' : 'bg-[var(--primary)]',
        )}
      >
        {detecting ? 'Détection…' : '+ Ajouter un repo'}
      </button>
      {status && <span className="text-xs text-[var(--success)]">{status}</span>}
    </div>
  );
}

export { PROFILES };
