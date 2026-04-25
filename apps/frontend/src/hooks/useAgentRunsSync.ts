import type { AgentRun, AgentRunStatus, AuditRun, AuditRunStatus } from '@nakiros/shared';

import { agentRunStore } from '../lib/agent-run-store';
import { usePolling } from './usePolling';

const AUDIT_STATUS_MAP: Record<AuditRunStatus, AgentRunStatus> = {
  starting: 'pending',
  running: 'running',
  waiting_for_input: 'awaiting_input',
  completed: 'done',
  failed: 'failed',
  stopped: 'cancelled',
};

function auditToAgentRun(audit: AuditRun): AgentRun {
  return {
    id: audit.runId,
    kind: 'audit',
    title: `Audit · ${audit.skillName}`,
    target: {
      type: 'skill',
      scope: audit.scope,
      skillName: audit.skillName,
      projectId: audit.projectId,
      pluginName: audit.pluginName,
      marketplaceName: audit.marketplaceName,
    },
    status: AUDIT_STATUS_MAP[audit.status],
    startedAt: audit.startedAt,
    endedAt: audit.finishedAt ?? undefined,
    capabilities: {
      canSendMessage: true,
      canApprove: false,
      canStop: true,
    },
    tokensUsed: audit.tokensUsed,
  };
}

/**
 * Mount this once at the app shell to keep `agentRunStore` mirrored with the
 * daemon's active runs. v1 covers audit only — eval / fix / create adapters
 * land alongside the corresponding kind migrations. Runs disappearing from
 * the daemon's active list are removed locally on the next tick.
 */
export function useAgentRunsSync(): void {
  usePolling(async () => {
    const audits = await window.nakiros.listActiveAuditRuns();
    agentRunStore.syncKind('audit', audits.map(auditToAgentRun));
  }, 2000);
}
