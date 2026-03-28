import { useState } from 'react';
import { CheckCheck, FolderOpen, Trash2 } from 'lucide-react';

interface Props {
  previewRoot: string;
  fileCount: number;
  onApply(): Promise<void>;
  onDiscard(): void;
}

export default function PendingPreviewBanner({ previewRoot, fileCount, onApply, onDiscard }: Props) {
  const [applying, setApplying] = useState(false);

  async function handleApply() {
    setApplying(true);
    try {
      await onApply();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-[18px] py-2 text-[13px]">
      <FolderOpen className="size-4 shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 truncate text-amber-200">
        <span className="font-semibold">Preview en attente</span>
        {' — '}
        <span className="font-mono text-[12px] text-amber-300/70">{previewRoot}</span>
        <span className="ml-2 text-amber-300/50">({fileCount} fichier{fileCount > 1 ? 's' : ''})</span>
      </span>
      <button
        onClick={handleApply}
        disabled={applying}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-500/20 px-3 py-1 font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
      >
        <CheckCheck className="size-3.5" />
        {applying ? 'Application…' : 'Valider'}
      </button>
      <button
        onClick={onDiscard}
        disabled={applying}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-amber-400/60 hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
        Supprimer
      </button>
    </div>
  );
}
