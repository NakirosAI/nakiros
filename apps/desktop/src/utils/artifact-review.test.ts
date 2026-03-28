import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyArtifactSnapshot,
  buildArtifactContextRunMessage,
  hasArtifactBaselineConflict,
  readArtifactSnapshot,
  resolveArtifactMode,
  rollbackArtifactSnapshot,
} from './artifact-review.js';

function setWindowNakirosMock(mock: Record<string, unknown>) {
  Object.defineProperty(globalThis, 'window', {
    value: { nakiros: mock },
    configurable: true,
    writable: true,
  });
}

test('buildArtifactContextRunMessage embeds exact target instructions', () => {
  const message = buildArtifactContextRunMessage({
    target: { kind: 'workspace_doc', absolutePath: '/tmp/decision.md' },
    mode: 'diff',
    sourceSurface: 'chat',
    title: 'Decision',
  }, 'Please rewrite this.');

  assert.match(message, /You are editing a specific artifact\./);
  assert.match(message, /Mode: diff\./);
  assert.match(message, /"kind":"workspace_doc","absolutePath":"\/tmp\/decision\.md"/);
  assert.match(message, /Please rewrite this\.$/);
  assert.equal(resolveArtifactMode(undefined, 'yolo'), 'yolo');
  assert.equal(resolveArtifactMode(undefined, undefined), 'diff');
});

test('workspace_doc snapshots support read, conflict detection, apply and rollback', async () => {
  let currentDoc = '# First version';
  const writes: Array<{ path: string; content: string }> = [];
  setWindowNakirosMock({
    readDoc: async (path: string) => {
      assert.equal(path, '/tmp/decision.md');
      return currentDoc;
    },
    writeDoc: async (path: string, content: string) => {
      writes.push({ path, content });
      currentDoc = content;
    },
  });

  const snapshot = await readArtifactSnapshot({ kind: 'workspace_doc', absolutePath: '/tmp/decision.md' });
  assert.equal(snapshot.title, 'decision.md');
  assert.equal(snapshot.content, '# First version');
  assert.equal(await hasArtifactBaselineConflict({ kind: 'workspace_doc', absolutePath: '/tmp/decision.md' }, '# First version'), false);
  assert.equal(await hasArtifactBaselineConflict({ kind: 'workspace_doc', absolutePath: '/tmp/decision.md' }, '# Older version'), true);

  await applyArtifactSnapshot({ kind: 'workspace_doc', absolutePath: '/tmp/decision.md' }, '# Second version');
  await rollbackArtifactSnapshot({ kind: 'workspace_doc', absolutePath: '/tmp/decision.md' }, '# First version');

  assert.equal(currentDoc, '# First version');
  assert.deepEqual(writes, [
    { path: '/tmp/decision.md', content: '# Second version' },
    { path: '/tmp/decision.md', content: '# First version' },
  ]);
});

test('applyArtifactSnapshot parses backlog story markdown into an update payload', async () => {
  const updates: Array<{ workspaceId: string; storyId: string; patch: unknown }> = [];
  setWindowNakirosMock({
    backlogUpdateStory: async (workspaceId: string, storyId: string, patch: unknown) => {
      updates.push({ workspaceId, storyId, patch });
      return null;
    },
  });

  await applyArtifactSnapshot(
    { kind: 'backlog_story', workspaceId: 'ws-1', id: 'story-1' },
    [
      '---',
      'kind: backlog_story',
      'id: story-1',
      'title: Improve onboarding',
      'status: in_progress',
      'priority: high',
      'storyPoints: 5',
      'epicId: epic-9',
      'sprintId: sprint-2',
      'assignee: Sam',
      '---',
      '',
      '## Description',
      'Rewrite the first-run flow.',
      '',
      '## Acceptance Criteria',
      '- User sees setup checklist',
      '- Errors are actionable',
    ].join('\n'),
  );

  assert.deepEqual(updates, [{
    workspaceId: 'ws-1',
    storyId: 'story-1',
    patch: {
      title: 'Improve onboarding',
      status: 'in_progress',
      priority: 'high',
      storyPoints: 5,
      epicId: 'epic-9',
      sprintId: 'sprint-2',
      assignee: 'Sam',
      description: 'Rewrite the first-run flow.',
      acceptanceCriteria: ['User sees setup checklist', 'Errors are actionable'],
    },
  }]);
});

test('rollbackArtifactSnapshot for backlog_task restores the baseline through backlogUpdateTask', async () => {
  const taskUpdates: Array<{ workspaceId: string; storyId: string; taskId: string; patch: unknown }> = [];
  setWindowNakirosMock({
    backlogGetStories: async () => [{
      id: 'story-7',
      workspaceId: 'ws-1',
      epicId: null,
      sprintId: null,
      title: 'Story',
      description: null,
      acceptanceCriteria: null,
      status: 'backlog',
      priority: 'medium',
      assignee: null,
      storyPoints: null,
      rank: 0,
      externalId: null,
      externalSource: null,
      lastSyncedAt: null,
      createdAt: 0,
      updatedAt: 0,
    }],
    backlogGetTasks: async (_workspaceId: string, storyId: string) => storyId === 'story-7' ? [{
      id: 'task-3',
      storyId: 'story-7',
      title: 'Original task',
      description: 'Baseline description',
      type: 'backend',
      status: 'todo',
      assignee: 'Lee',
      rank: 0,
      createdAt: 0,
      updatedAt: 0,
    }] : [],
    backlogUpdateTask: async (workspaceId: string, storyId: string, taskId: string, patch: unknown) => {
      taskUpdates.push({ workspaceId, storyId, taskId, patch });
      return null;
    },
  });

  await rollbackArtifactSnapshot(
    { kind: 'backlog_task', workspaceId: 'ws-1', id: 'task-3' },
    [
      '---',
      'kind: backlog_task',
      'id: task-3',
      'title: Original task',
      'type: backend',
      'status: todo',
      'assignee: Lee',
      '---',
      '',
      '## Description',
      'Baseline description',
    ].join('\n'),
  );

  assert.deepEqual(taskUpdates, [{
    workspaceId: 'ws-1',
    storyId: 'story-7',
    taskId: 'task-3',
    patch: {
      title: 'Original task',
      type: 'backend',
      status: 'todo',
      assignee: 'Lee',
      description: 'Baseline description',
    },
  }]);
});
