import { useEffect, useState } from 'react';
import type { JiraBoardType, JiraTicketCount } from '@nakiros/shared';

interface UseJiraProjectInsightsOptions {
  workspaceId: string;
  enabled: boolean;
  projectKey?: string;
  syncFilter: string;
}

export function useJiraProjectInsights(options: UseJiraProjectInsightsOptions) {
  const { workspaceId, enabled, projectKey, syncFilter } = options;
  const [boardType, setBoardType] = useState<JiraBoardType | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boardDetecting, setBoardDetecting] = useState(false);
  const [ticketCount, setTicketCount] = useState<JiraTicketCount | null>(null);
  const [ticketCountLoading, setTicketCountLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !projectKey) {
      setBoardType(null);
      setBoardId(null);
      return;
    }

    let cancelled = false;
    setBoardDetecting(true);

    void window.nakiros.jiraGetBoardType(workspaceId, projectKey)
      .then((selection) => {
        if (cancelled) return;
        setBoardType(selection.boardType);
        setBoardId(selection.boardId);
      })
      .catch(() => {
        if (cancelled) return;
        setBoardType('unknown');
        setBoardId(null);
      })
      .finally(() => {
        if (!cancelled) setBoardDetecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, projectKey, workspaceId]);

  useEffect(() => {
    if (!enabled || !projectKey || boardDetecting) {
      setTicketCount(null);
      return;
    }

    let cancelled = false;
    setTicketCountLoading(true);

    void window.nakiros.jiraCountTickets(workspaceId, projectKey, syncFilter, boardType ?? 'unknown')
      .then((count) => {
        if (!cancelled) setTicketCount(count);
      })
      .catch(() => {
        if (!cancelled) setTicketCount(null);
      })
      .finally(() => {
        if (!cancelled) setTicketCountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boardDetecting, boardType, enabled, projectKey, syncFilter, workspaceId]);

  return {
    boardType,
    boardId,
    boardDetecting,
    ticketCount,
    ticketCountLoading,
  };
}
