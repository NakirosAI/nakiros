import type { StoredRepo } from '@nakiros/shared';
import { PROFILE_LABELS } from '../utils/profiles';
import { truncatePath } from '../utils/strings';
import clsx from 'clsx';

interface Props {
  repo: StoredRepo;
}

const PROFILE_BADGE_CLASSES = {
  'frontend-react': 'bg-[#61dafb]',
  'frontend-vue': 'bg-[#42b883]',
  'frontend-angular': 'bg-[#dd0031]',
  'backend-node': 'bg-[#68a063]',
  'backend-python': 'bg-[#3776ab]',
  'backend-rust': 'bg-[#ce4a00]',
  'backend-go': 'bg-[#00add8]',
  'mobile-rn': 'bg-[#0088cc]',
  fullstack: 'bg-[#8b5cf6]',
  generic: 'bg-[#6b7280]',
} as const;

export default function RepoCard({ repo }: Props) {
  async function handleOpen() {
    await window.nakiros.openPath(repo.localPath);
  }

  const label = PROFILE_LABELS[repo.profile];

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--bg-soft)] p-4">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'rounded-[10px] px-2 py-0.5 text-[11px] font-semibold text-white',
            PROFILE_BADGE_CLASSES[repo.profile],
          )}
        >
          {label}
        </span>
        <strong className="text-[15px]">{repo.name}</strong>
      </div>

      {repo.role && (
        <p className="m-0 text-[13px] text-[var(--text-muted)]">{repo.role}</p>
      )}

      <p
        className="m-0 font-mono text-xs text-[var(--text-muted)]"
        title={repo.localPath}
      >
        {truncatePath(repo.localPath)}
      </p>

      <button
        onClick={handleOpen}
        className="mt-1 self-start rounded-[10px] border border-[var(--line)] bg-[var(--bg-muted)] px-3 py-[7px] text-[13px] font-semibold text-[var(--text)]"
      >
        Ouvrir
      </button>
    </div>
  );
}
