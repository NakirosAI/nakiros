import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { McpTargetContext } from '@nakiros/shared';

import { buildCodexMcpAuditPrompt } from './audit-runner.js';
import { buildCodexMcpPrompt } from './fix-runner.js';
import { resolveMcpAgentProvider } from './mcp-agent-provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Real bundled skill directory — SKILL.md and the codex references/script
// paths referenced by the prompt builders genuinely exist here, so the test
// exercises the same paths a live run would compute.
const skillDir = join(__dirname, '..', '..', 'bundled-skills', 'nakiros-mcp-expert');

const projectPath = '/tmp/fixture-project';
const workdir = '/tmp/nakiros-mcp-run';

function codexTarget(mode: McpTargetContext['mode']): McpTargetContext {
  return { projectId: 'proj-1', projectPath, mode, provider: 'codex' };
}

describe('resolveMcpAgentProvider', () => {
  it('returns codex only when the mcpTarget explicitly says so', () => {
    assert.equal(resolveMcpAgentProvider(codexTarget('audit')), 'codex');
    assert.equal(resolveMcpAgentProvider({ projectId: 'p', projectPath, mode: 'audit' }), 'claude');
    assert.equal(resolveMcpAgentProvider({ projectId: 'p', projectPath, mode: 'audit', provider: 'claude' }), 'claude');
    assert.equal(resolveMcpAgentProvider(undefined), 'claude');
  });
});

/**
 * The runner's own directive text (everything before the inlined SKILL.md)
 * must never instruct Codex to type a slash command — Codex has no
 * slash-command mechanism (`.claude/rules/runners.md` — "Skill tool
 * isolation"). The inlined SKILL.md body itself may legitimately *mention*
 * `/nakiros-mcp-expert ...` in prose (e.g. its "Edit mode" heading) since
 * that text is embedded verbatim and unmodified — this helper isolates the
 * wrapper so the assertion targets only what the runner itself wrote.
 */
function wrapperOnly(prompt: string): string {
  return prompt.split('--- BEGIN SKILL.md ---')[0];
}

describe('buildCodexMcpAuditPrompt (audit-runner)', () => {
  it('inlines SKILL.md and never directs Codex to type a slash-command', () => {
    const prompt = buildCodexMcpAuditPrompt(codexTarget('audit'), skillDir);

    assert.match(prompt, /provider: codex/);
    assert.match(prompt, /\.codex[/\\]config\.toml/);
    assert.match(prompt, /--- BEGIN SKILL\.md ---/);
    assert.doesNotMatch(wrapperOnly(prompt), /\/nakiros-mcp-expert\s+(audit|fix|create|edit)\b/);
    // The inlined SKILL.md body must actually be present (not a stub).
    assert.match(prompt, /Provider is an explicit input/);
    // Absolute, provider-specific paths — not the ~/.claude/skills convention.
    assert.match(prompt, /references[/\\]codex/);
    assert.match(prompt, /run-static-checks\.mjs --provider codex/);
  });
});

describe('buildCodexMcpPrompt (fix-runner)', () => {
  it('builds a fix prompt targeting .codex/config.toml with no slash-command', () => {
    const prompt = buildCodexMcpPrompt(codexTarget('fix'), skillDir, 'fix', workdir);

    assert.match(prompt, /provider: codex/);
    assert.match(prompt, /\.codex[/\\]config\.toml/);
    assert.match(prompt, /nakiros-mcp-run[/\\]draft\.toml/);
    assert.match(prompt, /Do not edit the final target directly/);
    assert.match(prompt, /--- BEGIN SKILL\.md ---/);
    assert.doesNotMatch(wrapperOnly(prompt), /\/nakiros-mcp-expert\s+(audit|fix|create|edit)\b/);
    assert.match(prompt, /Fixing the MCP configuration/);
  });

  it('builds an edit-mode prompt that waits for the user instead of auto-fixing', () => {
    const prompt = buildCodexMcpPrompt(codexTarget('edit'), skillDir, 'edit', workdir);

    assert.match(prompt, /provider: codex/);
    assert.match(prompt, /edit mode/);
    assert.doesNotMatch(wrapperOnly(prompt), /\/nakiros-mcp-expert\s+(audit|fix|create|edit)\b/);
    assert.match(prompt, /WAIT for/);
  });

  it('builds a create prompt for a not-yet-existing config.toml', () => {
    const prompt = buildCodexMcpPrompt(codexTarget('create'), skillDir, 'create', workdir);

    assert.match(prompt, /does not exist yet/);
    assert.doesNotMatch(wrapperOnly(prompt), /\/nakiros-mcp-expert\s+(audit|fix|create|edit)\b/);
  });
});
