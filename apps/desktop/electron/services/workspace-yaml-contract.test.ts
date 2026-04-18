import test from 'node:test';
import assert from 'node:assert/strict';
import type { StoredWorkspace } from '@nakiros/shared';
import {
  buildWorkspaceYaml,
  parseCanonicalWorkspaceYaml,
} from './workspace-yaml.js';

const sampleWorkspace: StoredWorkspace = {
  id: 'ws-1',
  name: 'Exploitation',
  workspacePath: '/tmp/exploitation',
  repos: [
    {
      name: 'exploitation-front',
      localPath: '/tmp/exploitation/front',
      role: 'frontend',
      profile: 'frontend-react',
      llmDocs: [],
    },
    {
      name: 'kpe-back',
      localPath: '/tmp/exploitation/back',
      role: 'backend',
      profile: 'backend-node',
      llmDocs: [],
    },
  ],
  pmTool: 'github',
  projectKey: 'EXP',
  createdAt: '2026-03-25T00:00:00.000Z',
  lastOpenedAt: '2026-03-25T00:00:00.000Z',
  topology: 'multi',
  documentLanguage: 'English',
  branchPattern: 'feature/{id}',
  pmBoardId: '42',
};

test('canonical workspace yaml parsing preserves repos and workspace metadata', () => {
  const parsed = parseCanonicalWorkspaceYaml(buildWorkspaceYaml(sampleWorkspace), 'exploitation');

  assert.equal(parsed.name, 'Exploitation');
  assert.equal(parsed.slug, 'exploitation');
  assert.equal(parsed.structure, 'multi-repo');
  assert.equal(parsed.pmTool, 'github');
  assert.equal(parsed.projectKey, 'EXP');
  assert.equal(parsed.documentLanguage, 'English');
  assert.equal(parsed.branchPattern, 'feature/{id}');
  assert.equal(parsed.repos.length, 2);
  assert.deepEqual(parsed.repos[0], {
    name: 'exploitation-front',
    role: 'primary',
    localPath: '/tmp/exploitation/front',
    profile: 'frontend-react',
  });
});
