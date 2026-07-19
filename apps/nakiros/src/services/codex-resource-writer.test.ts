import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  deleteCodexResource,
  listCodexResources,
  readCodexResource,
  saveCodexResource,
} from './codex-resource-writer.js';

const projects: string[] = [];

function project(): string {
  const path = mkdtempSync(join(tmpdir(), 'nakiros-codex-resources-'));
  projects.push(path);
  return path;
}

afterEach(() => {
  for (const path of projects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('Codex resource writer', () => {
  it('discovers root, nested, and override instructions without following symlinks', () => {
    const root = project();
    mkdirSync(join(root, 'packages', 'web'), { recursive: true });
    writeFileSync(join(root, 'AGENTS.md'), '# Root\n');
    writeFileSync(join(root, 'packages', 'AGENTS.md'), '# Package\n');
    writeFileSync(join(root, 'packages', 'web', 'AGENTS.override.md'), '# Override\n');
    symlinkSync(join(root, 'packages'), join(root, 'linked'));

    assert.deepEqual(
      listCodexResources(root, 'instructions').map((item) => item.id),
      ['AGENTS.md', 'packages/AGENTS.md', 'packages/web/AGENTS.override.md'],
    );
  });

  it('creates and atomically updates each prioritized native format', () => {
    const root = project();
    const cases = [
      ['instructions', 'AGENTS.md', '# Instructions\n'],
      ['rules', 'typescript', 'prefix_rule(pattern=["pnpm", "test"], decision="allow")\n'],
      ['subagents', 'reviewer', 'name = "reviewer"\ndescription = "Review changes"\n'],
      ['hooks', 'hooks', '{"hooks": []}\n'],
      ['skills', 'reviewer', '---\nname: reviewer\n---\nReview code.\n'],
    ] as const;

    for (const [kind, id, content] of cases) {
      const created = saveCodexResource(root, kind, id, content, '');
      assert.equal(created.ok, true, `${kind} should be created`);
      if (!created.ok) continue;
      assert.equal(created.file.content, content);
      assert.notEqual(created.file.mtime, '');
      assert.equal(readCodexResource(root, kind, created.file.id).ok, true);
    }

    assert.equal(readFileSync(join(root, '.codex', 'agents', 'reviewer.toml'), 'utf8').includes('reviewer'), true);
    assert.equal(readFileSync(join(root, '.agents', 'skills', 'reviewer', 'SKILL.md'), 'utf8').includes('Review'), true);
  });

  it('validates JSON and TOML before writing', () => {
    const root = project();
    const hooks = saveCodexResource(root, 'hooks', 'hooks', '{', '');
    const agent = saveCodexResource(root, 'subagents', 'broken', 'name = [', '');

    assert.equal(hooks.ok, false);
    if (!hooks.ok) assert.equal(hooks.code, 'invalid-json');
    assert.equal(agent.ok, false);
    if (!agent.ok) assert.equal(agent.code, 'invalid-toml');
  });

  it('rejects semantically invalid MCP TOML before merging config.toml', () => {
    const root = project();
    const invalid = saveCodexResource(
      root,
      'mcp',
      'mcp',
      '[mcp_servers.docs]\nurl = 42\n',
      '',
    );

    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, 'invalid-configuration');
    assert.equal(readCodexResource(root, 'mcp', 'mcp').ok, true);
    assert.throws(() => readFileSync(join(root, '.codex', 'config.toml'), 'utf8'));
  });

  it('rejects stale mtimes, path traversal, and symlinked storage directories', () => {
    const root = project();
    const created = saveCodexResource(root, 'rules', 'safe', 'first\n', '');
    assert.equal(created.ok, true);
    if (!created.ok) return;

    writeFileSync(join(root, '.codex', 'rules', 'safe.rules'), 'external\n');
    const future = new Date(Date.now() + 2_000);
    utimesSync(join(root, '.codex', 'rules', 'safe.rules'), future, future);
    const conflict = saveCodexResource(root, 'rules', 'safe', 'second\n', created.file.mtime);
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, 'conflict');

    const traversal = readCodexResource(root, 'instructions', '../AGENTS.md');
    assert.equal(traversal.ok, false);
    if (!traversal.ok) assert.equal(traversal.code, 'invalid-id');

    const outside = project();
    const linkedRoot = project();
    mkdirSync(join(linkedRoot, '.codex'));
    symlinkSync(outside, join(linkedRoot, '.codex', 'agents'));
    const unsafe = saveCodexResource(linkedRoot, 'subagents', 'reviewer', 'name = "reviewer"\n', '');
    assert.equal(unsafe.ok, false);
    if (!unsafe.ok) assert.equal(unsafe.code, 'unsafe-path');
  });

  it('deletes with an optional mtime guard', () => {
    const root = project();
    const created = saveCodexResource(root, 'rules', 'unused', 'rule\n', '');
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const deleted = deleteCodexResource(root, 'rules', created.file.id, created.file.mtime);
    assert.equal(deleted.ok, true);
    if (deleted.ok) assert.equal(deleted.file.exists, false);
  });

  it('edits permissions and MCP slices without replacing unrelated config', () => {
    const root = project();
    const initial = [
      '# retained comment',
      'model = "gpt-5.4"',
      'approval_policy = "on-request"',
      '',
      '[mcp_servers.docs]',
      'command = "docs-server"',
      '',
      '[features]',
      'multi_agent = true',
      '',
    ].join('\n');
    const config = saveCodexResource(root, 'native-config', 'config', initial, '');
    assert.equal(config.ok, true);
    if (!config.ok) return;

    const permissions = readCodexResource(root, 'permissions', 'permissions');
    assert.equal(permissions.ok, true);
    if (!permissions.ok) return;
    assert.equal(permissions.file.content, 'approval_policy = "on-request"');
    const permissionsSaved = saveCodexResource(
      root,
      'permissions',
      'permissions',
      'approval_policy = "never"\nsandbox_mode = "workspace-write"\n',
      permissions.file.mtime,
    );
    assert.equal(permissionsSaved.ok, true);
    if (!permissionsSaved.ok) return;

    const mcp = readCodexResource(root, 'mcp', 'mcp');
    assert.equal(mcp.ok, true);
    if (!mcp.ok) return;
    assert.match(mcp.file.content, /docs-server/);
    const mcpSaved = saveCodexResource(
      root,
      'mcp',
      'mcp',
      '[mcp_servers.local]\ncommand = "local-server"\n',
      mcp.file.mtime,
    );
    assert.equal(mcpSaved.ok, true);

    const raw = readFileSync(join(root, '.codex', 'config.toml'), 'utf8');
    assert.match(raw, /# retained comment/);
    assert.match(raw, /model = "gpt-5.4"/);
    assert.match(raw, /multi_agent = true/);
    assert.match(raw, /approval_policy = "never"/);
    assert.match(raw, /local-server/);
    assert.doesNotMatch(raw, /docs-server/);
  });
});
