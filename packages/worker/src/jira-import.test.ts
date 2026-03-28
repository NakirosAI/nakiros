import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJiraAuthHeader,
  extractAdfText,
  mapJiraStatus,
  mapJiraPriority,
} from './jira-import.js';
import { isSupportedImportProvider } from './pm-import.js';

// ─── isSupportedImportProvider ───────────────────────────────────────────────

test('isSupportedImportProvider returns true for jira', () => {
  assert.equal(isSupportedImportProvider('jira'), true);
});

test('isSupportedImportProvider returns false for github', () => {
  assert.equal(isSupportedImportProvider('github'), false);
});

test('isSupportedImportProvider returns false for empty string', () => {
  assert.equal(isSupportedImportProvider(''), false);
});

// ─── buildJiraAuthHeader ──────────────────────────────────────────────────────

test('buildJiraAuthHeader produces Basic base64 email:token', () => {
  const header = buildJiraAuthHeader('user@example.com', 'secret123');
  assert.equal(header, `Basic ${btoa('user@example.com:secret123')}`);
});

// ─── extractAdfText ───────────────────────────────────────────────────────────

test('extractAdfText returns null for null input', () => {
  assert.equal(extractAdfText(null), null);
});

test('extractAdfText returns null for non-object input', () => {
  assert.equal(extractAdfText('plain string'), null);
});

test('extractAdfText extracts text from ADF document', () => {
  const adf = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
    ],
  };
  const result = extractAdfText(adf);
  assert.ok(result?.includes('Hello'));
  assert.ok(result?.includes('world'));
  assert.ok(result?.includes('Second paragraph'));
});

test('extractAdfText returns null for empty content', () => {
  const adf = { type: 'doc', content: [] };
  assert.equal(extractAdfText(adf), null);
});

// ─── mapJiraStatus ────────────────────────────────────────────────────────────

test('mapJiraStatus maps "Done" to done', () => {
  assert.equal(mapJiraStatus('Done'), 'done');
});

test('mapJiraStatus maps "closed" (case-insensitive) to done', () => {
  assert.equal(mapJiraStatus('Closed'), 'done');
});

test('mapJiraStatus maps "In Progress" to in_progress', () => {
  assert.equal(mapJiraStatus('In Progress'), 'in_progress');
});

test('mapJiraStatus maps "In Review" to in_review', () => {
  assert.equal(mapJiraStatus('In Review'), 'in_review');
});

test('mapJiraStatus maps "To Do" to todo', () => {
  assert.equal(mapJiraStatus('To Do'), 'todo');
});

test('mapJiraStatus maps unknown status to backlog', () => {
  assert.equal(mapJiraStatus('Unknown Custom Status'), 'backlog');
});

// ─── mapJiraPriority ──────────────────────────────────────────────────────────

test('mapJiraPriority maps "High" to high', () => {
  assert.equal(mapJiraPriority('High'), 'high');
});

test('mapJiraPriority maps "Critical" to high', () => {
  assert.equal(mapJiraPriority('Critical'), 'high');
});

test('mapJiraPriority maps "Low" to low', () => {
  assert.equal(mapJiraPriority('Low'), 'low');
});

test('mapJiraPriority maps undefined to medium', () => {
  assert.equal(mapJiraPriority(undefined), 'medium');
});

test('mapJiraPriority maps unknown to medium', () => {
  assert.equal(mapJiraPriority('Normal'), 'medium');
});
