import { useEffect, useState } from 'react';

import type {
  CodexConversationAnalysis,
  ConversationAnalysis,
  ArgosConversationDashboard,
  ProviderConversationAnalysis,
} from '@nakiros/shared';

export type { ProviderConversationAnalysis } from '@nakiros/shared';

export function isCodexConversationAnalysis(
  analysis: ProviderConversationAnalysis,
): analysis is CodexConversationAnalysis {
  return 'provider' in analysis && analysis.provider === 'codex';
}

export function isClaudeConversationAnalysis(
  analysis: ProviderConversationAnalysis,
): analysis is ConversationAnalysis {
  return !isCodexConversationAnalysis(analysis);
}

/**
 * Fetch the per-conversation analyses for `projectId` via
 * `window.nakiros.listProjectConversationsWithAnalysis`. Returns `null`
 * while the fetch is in flight (treat as "loading"), then the array.
 *
 * Re-runs when `projectId` changes — pending requests for the previous id
 * are ignored (no late state update).
 */
export function useConversationAnalyses(projectId: string): ProviderConversationAnalysis[] | null {
  const [analyses, setAnalyses] = useState<ProviderConversationAnalysis[] | null>(null);

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

/** Fetches the Argos list and comparison from one daemon snapshot. */
export function useArgosConversationDashboard(
  projectId: string,
): ArgosConversationDashboard | null {
  const [dashboard, setDashboard] = useState<ArgosConversationDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDashboard(null);
    void window.nakiros.getArgosConversationDashboard(projectId).then((data) => {
      if (!cancelled && data) setDashboard(data);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return dashboard;
}
