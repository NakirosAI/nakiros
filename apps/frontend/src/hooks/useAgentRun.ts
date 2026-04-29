import { useMemo, useSyncExternalStore } from 'react';

import type { AgentRun } from '@nakiros/shared';

import { agentRunStore } from '../lib/agent-run-store';
import type { SkillTabIdentity } from './useTabs';

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

/**
 * Find the in-flight fix run targeting the given skill identity, if any.
 * Used by every "Fix" button in the new-design surface to grey itself out
 * when a fix is already running on this skill (avoids double-launch and
 * gives the user a visual cue that work is in progress). Matches against
 * `kind: 'fix'` only — `audit` and `eval` runs on the same skill don't
 * block a fix.
 */
export function useActiveFixForSkill(
  identity: SkillTabIdentity | null | undefined,
): AgentRun | undefined {
  const runs = useActiveAgentRuns();
  return useMemo(() => {
    if (!identity) return undefined;
    return runs.find((r) => {
      if (r.kind !== 'fix') return false;
      // Terminal runs hang around for the dismiss UX — don't treat them
      // as "active" from the trigger button's perspective.
      if (r.status === 'done' || r.status === 'failed' || r.status === 'cancelled') return false;
      const t = r.target;
      if (!t || t.type !== 'skill') return false;
      if (t.scope !== identity.scope) return false;
      if (t.skillName !== identity.skillName) return false;
      if (identity.scope === 'project' && t.scope === 'project') {
        if (t.projectId !== identity.projectId) return false;
      }
      if (identity.scope === 'plugin' && t.scope === 'plugin') {
        if (t.pluginName !== identity.pluginName) return false;
        if (t.marketplaceName !== identity.marketplaceName) return false;
      }
      return true;
    });
  }, [runs, identity]);
}
