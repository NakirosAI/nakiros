import { useTranslation } from 'react-i18next';
import type { StoredRepo } from '@nakiros/shared';

interface TicketTabArtifactsProps {
  targetRepo?: StoredRepo;
  ticketId: string;
}

export function TicketTabArtifacts({ targetRepo, ticketId }: TicketTabArtifactsProps) {
  const { t } = useTranslation('ticket');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-[13px]">
        <h4 className="m-0 text-[13px] font-bold tracking-[0.02em]">{t('targetRepo')}</h4>
        {targetRepo ? (
          <>
            <div className="text-xs leading-[1.45] text-[var(--text)]"><strong>{t('nameLabel')}</strong> {targetRepo.name}</div>
            <div className="text-xs leading-[1.45] text-[var(--text)]"><strong>{t('pathLabel')}</strong> <code>{targetRepo.localPath}</code></div>
            {targetRepo.url && <div className="text-xs leading-[1.45] text-[var(--text)]"><strong>{t('remoteLabel')}</strong> <code>{targetRepo.url}</code></div>}
          </>
        ) : (
          <p className="m-0 text-[13px] text-[var(--text-muted)]">{t('noTargetRepo')}</p>
        )}
      </div>
      <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--bg-card)] p-[13px]">
        <h4 className="m-0 text-[13px] font-bold tracking-[0.02em]">{t('artifactsContext')}</h4>
        <div className="text-xs leading-[1.45] text-[var(--text)]"><code>.nakiros/context/brainstorming.md</code></div>
        <div className="text-xs leading-[1.45] text-[var(--text)]"><code>.nakiros/context/tickets/{ticketId}.md</code></div>
        <div className="text-xs leading-[1.45] text-[var(--text)]"><code>.nakiros/context/dev-notes/{ticketId}.md</code></div>
      </div>
    </div>
  );
}

