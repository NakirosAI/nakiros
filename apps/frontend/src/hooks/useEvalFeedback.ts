import { useCallback, useEffect, useState } from 'react';

import type { SkillScope } from '@nakiros/shared';

/** Identity of a specific eval iteration the user is providing feedback on. */
export interface EvalFeedbackTarget {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  marketplaceName?: string;
  skillName: string;
  iteration: number;
}

/** Return shape of {@link useEvalFeedback}. `feedback` is keyed by `evalName`. */
export interface UseEvalFeedbackResult {
  feedback: Record<string, string>;
  /** Optimistic update + persist via `eval:saveFeedback`. */
  save(evalName: string, text: string): Promise<void>;
}

/**
 * Load and persist the per-eval-name feedback map for one iteration of a
 * skill's eval suite. Wraps the `eval:getFeedback` / `eval:saveFeedback`
 * IPC channels and updates local state optimistically before the save
 * round-trip resolves.
 *
 * Re-fetches when any identity field changes; saves are scoped to the same
 * target.
 */
export function useEvalFeedback({
  scope,
  projectId,
  pluginName,
  marketplaceName,
  skillName,
  iteration,
}: EvalFeedbackTarget): UseEvalFeedbackResult {
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void window.nakiros
      .getEvalFeedback({ scope, projectId, pluginName, marketplaceName, skillName, iteration })
      .then((data) => {
        if (!cancelled) setFeedback(data);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, projectId, pluginName, marketplaceName, skillName, iteration]);

  const save = useCallback(
    async (evalName: string, text: string) => {
      setFeedback((prev) => ({ ...prev, [evalName]: text }));
      await window.nakiros.saveEvalFeedback({
        scope,
        projectId,
        pluginName,
        marketplaceName,
        skillName,
        iteration,
        evalName,
        feedback: text,
      });
    },
    [scope, projectId, pluginName, marketplaceName, skillName, iteration],
  );

  return { feedback, save };
}
