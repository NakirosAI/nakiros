import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCodexArgs, handleCodexStreamEvent } from './codex-stream.js';

describe('Codex runner stream', () => {
  it('builds initial and resumed non-interactive turns', () => {
    assert.deepEqual(buildCodexArgs({ prompt: 'Analyze' }), [
      'exec', '--json', '--color', 'never', '--sandbox', 'workspace-write',
      '--skip-git-repo-check', 'Analyze',
    ]);
    assert.deepEqual(buildCodexArgs({ prompt: 'Continue', resumeSessionId: 'thread-id' }), [
      'exec', 'resume', '--json', '--skip-git-repo-check', 'thread-id', 'Continue',
    ]);
  });

  it('maps native JSONL events into shared runner callbacks', () => {
    const sessions: string[] = [];
    const texts: string[] = [];
    const tools: string[] = [];
    const usages: number[] = [];
    const handlers = {
      onSession: (id: string) => sessions.push(id),
      onText: (text: string) => texts.push(text),
      onTool: (name: string) => tools.push(name),
      onUsage: (tokens: number) => usages.push(tokens),
    };

    handleCodexStreamEvent({ type: 'thread.started', thread_id: 'thread-id' }, handlers);
    handleCodexStreamEvent({
      type: 'item.started',
      item: { type: 'command_execution', command: 'pwd' },
    }, handlers);
    handleCodexStreamEvent({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Done' },
    }, handlers);
    handleCodexStreamEvent({
      type: 'turn.completed',
      usage: { input_tokens: 120, cached_input_tokens: 100, output_tokens: 30 },
    }, handlers);

    assert.deepEqual(sessions, ['thread-id']);
    assert.deepEqual(texts, ['Done']);
    assert.deepEqual(tools, ['Shell']);
    assert.deepEqual(usages, [150]);
  });
});
