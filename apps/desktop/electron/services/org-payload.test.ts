import test from 'node:test';
import assert from 'node:assert/strict';
import { createAddOrgMemberPayload } from './org-payload.js';

test('createAddOrgMemberPayload includes the selected organization role', () => {
  assert.deepEqual(
    createAddOrgMemberPayload('teammate@example.com', 'admin', 'owner@example.com'),
    {
      email: 'teammate@example.com',
      role: 'admin',
      inviterEmail: 'owner@example.com',
    },
  );
});

test('createAddOrgMemberPayload omits inviterEmail when absent', () => {
  assert.deepEqual(
    createAddOrgMemberPayload('teammate@example.com', 'member'),
    {
      email: 'teammate@example.com',
      role: 'member',
    },
  );
});
