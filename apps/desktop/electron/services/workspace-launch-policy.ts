import type { WorkspaceMembershipSubject } from '@nakiros/shared';

export interface WorkspaceLaunchDecision {
  allowed: boolean;
  reason: 'allowed' | 'beta-bypass' | 'personal' | 'not-added' | 'viewer';
}

export type WorkspaceLaunchDeniedReason = Extract<WorkspaceLaunchDecision['reason'], 'not-added' | 'viewer'>;

export function toWorkspaceLaunchDeniedCode(reason: WorkspaceLaunchDeniedReason): string {
  return `workspace_launch_denied:${reason}`;
}

export function evaluateWorkspaceLaunchAccess(args: {
  subject: WorkspaceMembershipSubject;
  enforceRoles: boolean;
}): WorkspaceLaunchDecision {
  if (!args.enforceRoles) {
    return { allowed: true, reason: 'beta-bypass' };
  }

  if (args.subject.scope === 'personal' || args.subject.status === 'personal') {
    return { allowed: true, reason: 'personal' };
  }

  if (args.subject.status !== 'active' || args.subject.role === null) {
    return { allowed: false, reason: 'not-added' };
  }

  if (args.subject.role === 'viewer') {
    return { allowed: false, reason: 'viewer' };
  }

  return { allowed: true, reason: 'allowed' };
}
