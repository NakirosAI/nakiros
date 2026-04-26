import { useEffect, useState } from 'react';

import type { ConversationAnalysis } from '@nakiros/shared';

/**
 * Fetch the per-conversation analyses for `projectId` via
 * `window.nakiros.listProjectConversationsWithAnalysis`. Returns `null`
 * while the fetch is in flight (treat as "loading"), then the array.
 *
 * Re-runs when `projectId` changes — pending requests for the previous id
 * are ignored (no late state update).
 */
export function useConversationAnalyses(projectId: string): ConversationAnalysis[] | null {
  const [analyses, setAnalyses] = useState<ConversationAnalysis[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnalyses(null);
    void window.nakiros.listProjectConversationsWithAnalysis(projectId).then((data) => {
      if (!cancelled) setAnalyses(data);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return analyses;
}
