import { Lightbulb } from 'lucide-react';
import type { Project } from '@nakiros/shared';

interface Props {
  project: Project;
}

export default function RecommendationsView({ project }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="rounded-full bg-[var(--bg-muted)] p-4">
        <Lightbulb size={32} className="text-[var(--text-muted)]" />
      </div>
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Recommendations</h2>
      <p className="max-w-md text-center text-sm text-[var(--text-muted)]">
        L'analyse des conversations de <strong>{project.name}</strong> pour détecter les points de friction
        et proposer des améliorations de skills arrive bientôt.
      </p>
      <div className="mt-4 rounded-lg border border-dashed border-[var(--line-strong)] px-4 py-3 text-xs text-[var(--text-muted)]">
        Phase 4 — Coming soon
      </div>
    </div>
  );
}
