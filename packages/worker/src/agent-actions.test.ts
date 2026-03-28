import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCreateEpicArgs,
  parseCreateStoryArgs,
  parseCreateTaskArgs,
} from './agent-actions.js';

// ── create_epic ───────────────────────────────────────────────────────────────

test('parseCreateEpicArgs — happy path with all fields', () => {
  const result = parseCreateEpicArgs({ name: 'Notifications', description: 'Desc', color: '#fff' });
  assert.ok(result.ok);
  assert.deepEqual(result.value, { name: 'Notifications', description: 'Desc', color: '#fff' });
});

test('parseCreateEpicArgs — happy path with name only', () => {
  const result = parseCreateEpicArgs({ name: 'Notifications' });
  assert.ok(result.ok);
  assert.deepEqual(result.value, { name: 'Notifications' });
});

test('parseCreateEpicArgs — missing name returns error', () => {
  const result = parseCreateEpicArgs({});
  assert.ok(!result.ok);
  assert.equal(result.error, 'name is required');
  assert.equal(result.status, 400);
});

test('parseCreateEpicArgs — empty name returns error', () => {
  const result = parseCreateEpicArgs({ name: '' });
  assert.ok(!result.ok);
  assert.equal(result.error, 'name is required');
});

// ── create_story ──────────────────────────────────────────────────────────────

test('parseCreateStoryArgs — happy path with all fields', () => {
  const result = parseCreateStoryArgs({
    title: 'Sprint notification',
    epic_id: 'epic-1',
    description: 'Desc',
    acceptance_criteria: 'AC1\nAC2\nAC3',
    priority: 'high',
    story_points: '5',
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value, {
    title: 'Sprint notification',
    epicId: 'epic-1',
    description: 'Desc',
    acceptanceCriteria: ['AC1', 'AC2', 'AC3'],
    priority: 'high',
    storyPoints: 5,
  });
});

test('parseCreateStoryArgs — missing title returns error', () => {
  const result = parseCreateStoryArgs({});
  assert.ok(!result.ok);
  assert.equal(result.error, 'title is required');
  assert.equal(result.status, 400);
});

test('parseCreateStoryArgs — acceptance_criteria splits on newline and trims', () => {
  const result = parseCreateStoryArgs({
    title: 'Story',
    acceptance_criteria: '  AC1  \n\n  AC2  \nAC3',
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value.acceptanceCriteria, ['AC1', 'AC2', 'AC3']);
});

test('parseCreateStoryArgs — empty acceptance_criteria lines are filtered out', () => {
  const result = parseCreateStoryArgs({
    title: 'Story',
    acceptance_criteria: '\n\n',
  });
  assert.ok(result.ok);
  assert.equal(result.value.acceptanceCriteria, undefined);
});

test('parseCreateStoryArgs — invalid priority is ignored', () => {
  const result = parseCreateStoryArgs({ title: 'Story', priority: 'critical' });
  assert.ok(result.ok);
  assert.equal(result.value.priority, undefined);
});

test('parseCreateStoryArgs — story_points parsed as number', () => {
  const result = parseCreateStoryArgs({ title: 'Story', story_points: '8' });
  assert.ok(result.ok);
  assert.equal(result.value.storyPoints, 8);
});

test('parseCreateStoryArgs — non-numeric story_points are ignored', () => {
  const result = parseCreateStoryArgs({ title: 'Story', story_points: 'abc' });
  assert.ok(result.ok);
  assert.equal(result.value.storyPoints, undefined);
});

// ── create_task ───────────────────────────────────────────────────────────────

test('parseCreateTaskArgs — happy path with all fields', () => {
  const result = parseCreateTaskArgs({ story_id: 'story-1', title: 'Task', type: 'backend', description: 'Desc' });
  assert.ok(result.ok);
  assert.deepEqual(result.value, { storyId: 'story-1', title: 'Task', type: 'backend', description: 'Desc' });
});

test('parseCreateTaskArgs — missing story_id returns error', () => {
  const result = parseCreateTaskArgs({ title: 'Task' });
  assert.ok(!result.ok);
  assert.equal(result.error, 'story_id is required');
  assert.equal(result.status, 400);
});

test('parseCreateTaskArgs — missing title returns error', () => {
  const result = parseCreateTaskArgs({ story_id: 'story-1' });
  assert.ok(!result.ok);
  assert.equal(result.error, 'title is required');
  assert.equal(result.status, 400);
});

test('parseCreateTaskArgs — invalid type is ignored', () => {
  const result = parseCreateTaskArgs({ story_id: 'story-1', title: 'Task', type: 'infra' });
  assert.ok(result.ok);
  assert.equal(result.value.type, undefined);
});

test('parseCreateTaskArgs — valid types are accepted', () => {
  for (const type of ['backend', 'frontend', 'test', 'other'] as const) {
    const result = parseCreateTaskArgs({ story_id: 'story-1', title: 'Task', type });
    assert.ok(result.ok);
    assert.equal(result.value.type, type);
  }
});
