import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Cycling "thinking" indicator shown while a runner is active but has not
 * streamed anything back yet. Verbs rotate so the user sees something alive
 * on screen (à la Claude Code's "Thinking…", "Reading…", etc.).
 */
export function ThinkingIndicator({
  verbs,
  intervalMs = 2500,
}: {
  verbs: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (verbs.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % verbs.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [verbs.length, intervalMs]);

  if (verbs.length === 0) return null;

  return (
    <div className="mr-8 flex items-center gap-2 rounded-lg border border-[var(--primary)]/30 bg-[var(--bg-card)] px-4 py-3">
      <Loader2 size={14} className="animate-spin text-[var(--primary)]" />
      <span className="text-sm italic text-[var(--text-muted)]">{verbs[index]}</span>
    </div>
  );
}
