import type { OrgRole } from '@nakiros/shared';

export function createAddOrgMemberPayload(email: string, role: OrgRole, inviterEmail?: string) {
  return {
    email,
    role,
    ...(inviterEmail ? { inviterEmail } : {}),
  };
}
