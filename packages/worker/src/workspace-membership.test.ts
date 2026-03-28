import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceMembershipList,
  canManageWorkspaceMemberships,
  hasManageableWorkspaceMember,
} from './workspace-membership.js';

test('buildWorkspaceMembershipList includes org members that are not yet added to the workspace', () => {
  const list = buildWorkspaceMembershipList(
    [
      { userId: 'user-1', email: 'owner@example.com', role: 'admin', joinedAt: '2026-03-10T10:00:00.000Z' },
      { userId: 'user-2', email: 'dev@example.com', role: 'member', joinedAt: '2026-03-10T11:00:00.000Z' },
    ],
    [
      {
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'owner',
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-11T10:00:00.000Z',
      },
    ],
    'user-1',
  );

  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((item) => ({ userId: item.userId, status: item.status, workspaceRole: item.workspaceRole })),
    [
      { userId: 'user-1', status: 'active', workspaceRole: 'owner' },
      { userId: 'user-2', status: 'not_added', workspaceRole: null },
    ],
  );
});

test('canManageWorkspaceMemberships allows org admin recovery when no manageable workspace member exists', () => {
  assert.equal(
    canManageWorkspaceMemberships({
      currentUserRole: null,
      isOrgAdmin: true,
      hasManageableMemberships: false,
    }),
    true,
  );
});

test('hasManageableWorkspaceMember rejects role sets with only non-managing roles', () => {
  assert.equal(
    hasManageableWorkspaceMember([
      { role: 'pm' },
      { role: 'dev' },
      { role: 'viewer' },
    ]),
    false,
  );
});
