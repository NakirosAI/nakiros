import { useSyncExternalStore } from 'react';

import type { AgentRun } from '@nakiros/shared';

import { agentRunStore } from '../lib/agent-run-store';

/**
 * Subscribe a component to one specific run by id. Returns `undefined` when
 * the run is unknown or has dropped out of the active set. Use this from any
 * trigger button anywhere in the UI to reflect "is something running on this
 * target?" without prop-threading.
 */
export function useAgentRun(id: string | null | undefined): AgentRun | undefined {
  return useSyncExternalStore(
    agentRunStore.subscribe,
    () => (id ? agentRunStore.get(id) : undefined),
  );
}

/**
 * Subscribe a component to the full active set across every kind. Used by
 * the topbar runs center and by any dashboard wanting to surface in-flight
 * work. Result is cached inside the store — safe to compare by reference.
 */
export function useActiveAgentRuns(): AgentRun[] {
  return useSyncExternalStore(agentRunStore.subscribe, agentRunStore.getActiveSnapshot);
}
