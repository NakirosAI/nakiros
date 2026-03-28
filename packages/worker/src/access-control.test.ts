import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, deriveWorkspaceOwnerId, resolveWorkspaceOwnerId } from './index.js';

test('deriveWorkspaceOwnerId defaults legacy workspaces to the authenticated user', () => {
  assert.equal(
    deriveWorkspaceOwnerId(undefined, { userId: 'user-1', orgId: 'org-1', email: 'owner@example.com' }),
    'user-1',
  );
});

test('deriveWorkspaceOwnerId preserves an existing owner on update', () => {
  assert.equal(
    deriveWorkspaceOwnerId('org-existing', { userId: 'user-1', orgId: 'org-1', email: 'owner@example.com' }),
    'org-existing',
  );
});

test('canAccess rejects workspaces owned by another organization', () => {
  assert.equal(
    canAccess(
      { id: 'ws-1', name: 'Workspace', ownerId: 'org-a', repos: [] },
      { userId: 'user-b', orgId: 'org-b', email: 'member@example.com' },
    ),
    false,
  );
});

test('resolveWorkspaceOwnerId allows transferring a personal workspace to a member organization', async () => {
  const result = await resolveWorkspaceOwnerId(
    {
      isOrgMember: async (orgId: string, userId: string) => orgId === 'org-1' && userId === 'user-1',
    },
    'user-1',
    'org-1',
    { userId: 'user-1', email: 'owner@example.com' },
  );

  assert.equal(result.errorResponse, undefined);
  assert.deepEqual(result, { ownerId: 'org-1', shouldSeedOwnerMembership: true });
});

test('resolveWorkspaceOwnerId defaults new workspaces to personal scope without an explicit organization choice', async () => {
  const result = await resolveWorkspaceOwnerId(
    {
      isOrgMember: async () => true,
    },
    undefined,
    undefined,
    { userId: 'user-1', orgId: 'org-1', email: 'owner@example.com' },
  );

  assert.equal(result.errorResponse, undefined);
  assert.deepEqual(result, { ownerId: 'user-1', shouldSeedOwnerMembership: false });
});

test('resolveWorkspaceOwnerId rejects moving an organization workspace back to personal scope', async () => {
  const result = await resolveWorkspaceOwnerId(
    {
      isOrgMember: async () => true,
    },
    'org-1',
    'user-1',
    { userId: 'user-1', email: 'owner@example.com' },
  );

  assert.equal(result.ownerId, 'org-1');
  assert.equal(result.shouldSeedOwnerMembership, false);
  assert.ok(result.errorResponse);
});
