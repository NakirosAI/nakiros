import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkspaceLaunchAccess, toWorkspaceLaunchDeniedCode } from './workspace-launch-policy.js';

test('evaluateWorkspaceLaunchAccess blocks viewers when enforcement is enabled', () => {
  const decision = evaluateWorkspaceLaunchAccess({
    subject: {
      workspaceId: 'ws-1',
      scope: 'organization',
      role: 'viewer',
      status: 'active',
    },
    enforceRoles: true,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'viewer');
});

test('evaluateWorkspaceLaunchAccess bypasses role checks while beta policy is active', () => {
  const decision = evaluateWorkspaceLaunchAccess({
    subject: {
      workspaceId: 'ws-1',
      scope: 'organization',
      role: 'viewer',
      status: 'active',
    },
    enforceRoles: false,
  });

  assert.deepEqual(decision, { allowed: true, reason: 'beta-bypass' });
});

test('evaluateWorkspaceLaunchAccess allows personal workspaces without membership rows', () => {
  const decision = evaluateWorkspaceLaunchAccess({
    subject: {
      workspaceId: 'ws-1',
      scope: 'personal',
      role: null,
      status: 'personal',
    },
    enforceRoles: true,
  });

  assert.deepEqual(decision, { allowed: true, reason: 'personal' });
});

test('toWorkspaceLaunchDeniedCode returns stable machine-readable codes', () => {
  assert.equal(toWorkspaceLaunchDeniedCode('viewer'), 'workspace_launch_denied:viewer');
  assert.equal(toWorkspaceLaunchDeniedCode('not-added'), 'workspace_launch_denied:not-added');
});
