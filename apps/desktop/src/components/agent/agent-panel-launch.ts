import type { AgentRunRequest } from '@nakiros/shared';
import type { AgentTabState, Message } from './agent-panel-utils.js';
import { createStreamingAgentMessage } from './agent-panel-runtime.js';

export interface RunTrackingRefMap {
  runToTabId: Map<string, string>;
  runToParticipantId: Map<string, string>;
  runStartedAt: Map<string, number>;
  runToOrchestrationExecution?: Map<string, { executionId: string; role: 'participant' | 'synthesis' }>;
}

export interface StartTrackedRunArgs {
  request: AgentRunRequest;
  tabId: string;
  participantId?: string | null;
  extraMessages?: Message[];
  orchestrationExecutionId?: string | null;
  orchestrationRole?: 'participant' | 'synthesis';
  runAgent: (request: AgentRunRequest) => Promise<string>;
  tracking: RunTrackingRefMap;
  setTabsAndRef: (updater: (prev: AgentTabState[]) => AgentTabState[]) => void;
}

export async function startTrackedRun(args: StartTrackedRunArgs): Promise<string> {
  const runId = await args.runAgent(args.request);
  args.tracking.runToTabId.set(runId, args.tabId);
  if (args.participantId) {
    args.tracking.runToParticipantId.set(runId, args.participantId);
  }
  if (
    args.orchestrationExecutionId
    && args.orchestrationRole
    && args.tracking.runToOrchestrationExecution
  ) {
    args.tracking.runToOrchestrationExecution.set(runId, {
      executionId: args.orchestrationExecutionId,
      role: args.orchestrationRole,
    });
  }
  args.tracking.runStartedAt.set(runId, Date.now());

  const streamingMessage = createStreamingAgentMessage(
    runId,
    args.request.agentId ?? (args.participantId?.split(':')[0] ?? null),
  );
  args.setTabsAndRef((prev) => prev.map((tab) => (
    tab.id !== args.tabId
      ? tab
      : {
        ...tab,
        activeRunId: runId,
        messages: [...tab.messages, ...(args.extraMessages ?? []), streamingMessage],
      }
  )));

  return runId;
}

export function appendRunStartError(args: {
  tabId: string;
  errorMessage: Message;
  setTabsAndRef: (updater: (prev: AgentTabState[]) => AgentTabState[]) => void;
}): void {
  args.setTabsAndRef((prev) => prev.map((tab) => (
    tab.id !== args.tabId
      ? tab
      : { ...tab, messages: [...tab.messages, args.errorMessage] }
  )));
}
