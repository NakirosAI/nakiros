import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildCodexInstructionsAuditPrompt,
} from './audit-runner.js';
import {
  buildCodexInstructionsPrompt,
} from './fix-runner.js';

const projectPath = '/tmp/nakiros-codex-instructions-project';
const skillDir = join(process.cwd(), 'bundled-skills', 'nakiros-claudemd-expert');
const workdir = '/tmp/nakiros-codex-instructions-run';
const target = {
  projectId: 'project-1',
  projectPath,
  provider: 'codex' as const,
  mode: 'audit' as const,
};

test('Codex instruction audit targets AGENTS.md without a slash command', () => {
  const prompt = buildCodexInstructionsAuditPrompt(target, skillDir);
  assert.match(prompt, /Provider: codex/);
  assert.match(prompt, new RegExp(`${projectPath}/AGENTS\\.md`));
  assert.doesNotMatch(prompt.split('--- BEGIN SKILL.md ---')[0], /^\/nakiros-claudemd-expert/m);
  assert.match(prompt, /do not modify the target/i);
});

test('Codex instruction edit writes only the isolated draft', () => {
  const prompt = buildCodexInstructionsPrompt(
    { ...target, mode: 'edit' },
    skillDir,
    'edit',
    workdir,
  );
  const wrapper = prompt.split('--- BEGIN SKILL.md ---')[0];
  assert.match(wrapper, new RegExp(`${workdir}/draft\\.md`));
  assert.match(wrapper, /Do not edit .*AGENTS\.md directly/);
  assert.doesNotMatch(wrapper, /^\/nakiros-claudemd-expert/m);
});

test('Codex recommendation prompt retains the recommendation brief', () => {
  const prompt = buildCodexInstructionsPrompt(
    { ...target, mode: 'fix' },
    skillDir,
    'fix',
    workdir,
    {
      artifactType: 'claudemd',
      action: 'fix',
      target: 'root',
      title: 'Pin validation command',
      recId: 'rec-1',
      patternId: 'pattern-1',
      brief: 'Add pnpm test as the required validation command.',
    },
  );
  assert.match(prompt, /<apply-recommendation>/);
  assert.match(prompt, /Add pnpm test/);
  assert.match(prompt, /Do not ask follow-up questions/i);
});
