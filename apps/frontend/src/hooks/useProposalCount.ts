import { useEffect, useState } from 'react';

import type { Proposal } from '@nakiros/shared';

// ---------------------------------------------------------------------------
// useProposalCount — count of *actionable* proposals for a given project.
//
// Actionable = `draft` | `eval_done` (the user can still accept or reject).
// We intentionally skip `eval_running` (in-flight, not ready for the user yet)
// and the terminal states (`accepted` | `rejected`, already handled).
//
// Proposals are project-scoped, so the badge count reflects the currently
// active project only. The hook refetches on every `proposals:new` broadcast;
// the daemon reuses that channel for both creation and status transitions,
// so a single re-read handles decrements as well as increments.
// ---------------------------------------------------------------------------

const ACTIONABLE: ReadonlySet<Proposal['status']> = new Set(['draft', 'eval_done']);

export function useProposalCount(projectId: string | null | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setCount(0);
      return;
    }
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const response = await window.nakiros.listProposals({ projectId: projectId! });
        if (cancelled) return;
        setCount(response.proposals.filter((p) => ACTIONABLE.has(p.status)).length);
      } catch {
        // Swallow — the full Recommendations view surfaces load errors.
      }
    }

    void refresh();
    const unsubscribe = window.nakiros.onProposalsNew((event) => {
      if (event.proposal.projectId !== projectId) return;
      void refresh();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  return count;
}
