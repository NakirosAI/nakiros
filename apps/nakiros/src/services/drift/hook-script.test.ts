import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HOOK_STOP_SCRIPT_SOURCE, HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE } from './hook-script.js';

describe('Argos drift hook scripts', () => {
  for (const [event, source] of [
    ['Stop', HOOK_STOP_SCRIPT_SOURCE],
    ['UserPromptSubmit', HOOK_USER_PROMPT_SUBMIT_SCRIPT_SOURCE],
  ] as const) {
    it(`${event} accepts both Claude and Codex hook payloads`, () => {
      assert.doesNotThrow(() => new Function(source.replace(/^#!.*\n/, '')));
      assert.match(source, /input\.transcript_path/);
      assert.match(source, /provider=codex/);
      assert.match(source, /&transcript=/);
      assert.match(source, new RegExp(`event=${event === 'Stop' ? 'stop' : 'userPromptSubmit'}`));
      assert.match(source, /\/\.codex\/sessions\//);
    });
  }
});
