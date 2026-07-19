import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { getCodexRunTimeline, parseCodexRunTimeline } from './codex-timeline.js';

const rollout = [
  { timestamp: '2026-07-19T10:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'You are acting as the "nakiros-test" skill\n--- BEGIN SKILL.md ---' } },
  { timestamp: '2026-07-19T10:00:01Z', type: 'event_msg', payload: { type: 'agent_message', phase: 'commentary', message: 'I am inspecting the target.' } },
  { timestamp: '2026-07-19T10:00:02Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'const r = await tools.exec_command({cmd:"pwd"})' } },
  { timestamp: '2026-07-19T10:00:03Z', type: 'response_item', payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'The configuration is valid.' }] } },
  { timestamp: '2026-07-19T10:00:04Z', type: 'event_msg', payload: { type: 'agent_message', phase: 'final_answer', message: 'Audit complete.' } },
  // Native response mirror: must not duplicate the event_msg above.
  { timestamp: '2026-07-19T10:00:04Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Audit complete.' }] } },
].map((entry) => JSON.stringify(entry)).join('\n');

test('parses Codex commentary, reasoning summaries, tools and final messages', () => {
  const timeline = parseCodexRunTimeline(rollout);
  assert.deepEqual(timeline.map((entry) => entry.kind), [
    'thinking',
    'tool',
    'thinking',
    'assistant_text',
  ]);
  assert.equal(timeline.filter((entry) => entry.kind === 'assistant_text').length, 1);
  assert.equal(timeline[0]?.kind === 'thinking' ? timeline[0].text : '', 'I am inspecting the target.');
});

test('finds a persisted Codex rollout by thread id', () => {
  const root = mkdtempSync(join(tmpdir(), 'nakiros-codex-timeline-'));
  const directory = join(root, '2026', '07', '19');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'rollout-2026-07-19-thread-123.jsonl'), rollout, 'utf8');
  const timeline = getCodexRunTimeline('thread-123', root);
  assert.ok(timeline.some((entry) => entry.kind === 'assistant_text'));
});
