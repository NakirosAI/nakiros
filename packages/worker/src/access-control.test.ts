import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, deriveWorkspaceOwnerId } from './index.js';

test('deriveWorkspaceOwnerId always trusts the authenticated org scope first', () => {
  assert.equal(
    deriveWorkspaceOwnerId(undefined, { userId: 'user-1', orgId: 'org-1', email: 'owner@example.com' }),
    'org-1',
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
