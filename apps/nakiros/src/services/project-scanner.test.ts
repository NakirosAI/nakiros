import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import type { ProjectAgentInstallation } from '@nakiros/shared';

import { enrichProjectCodexInstallation } from './project-scanner.js';

const tempProjects: string[] = [];

function tempProject(): string {
  const path = mkdtempSync(join(tmpdir(), 'nakiros-codex-detection-'));
  tempProjects.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempProjects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('project Codex installation enrichment', () => {
  it('detects Codex from a root AGENTS.md without rollout sessions', () => {
    const projectPath = tempProject();
    writeFileSync(join(projectPath, 'AGENTS.md'), '# Instructions\n', 'utf8');

    const project = enrichProjectCodexInstallation({
      projectPath,
      agents: [] as ProjectAgentInstallation[],
    });

    assert.equal(project.agents?.length, 1);
    assert.equal(project.agents?.[0]?.provider, 'codex');
    assert.equal(project.agents?.[0]?.providerProjectDir, join(projectPath, '.codex'));
    assert.equal(project.agents?.[0]?.capabilities.includes('native-config'), true);
  });

  it('detects Codex from project-scoped config.toml without rollout sessions', () => {
    const projectPath = tempProject();
    mkdirSync(join(projectPath, '.codex'));
    writeFileSync(join(projectPath, '.codex', 'config.toml'), 'model = "gpt-5"\n', 'utf8');

    const project = enrichProjectCodexInstallation({
      projectPath,
      agents: [] as ProjectAgentInstallation[],
    });

    assert.equal(project.agents?.[0]?.provider, 'codex');
    assert.equal(project.agents?.[0]?.capabilities.includes('native-config'), true);
  });

  it('refreshes the capability matrix of an already persisted Codex installation', () => {
    const projectPath = tempProject();
    const project = enrichProjectCodexInstallation({
      projectPath,
      agents: [
        {
          provider: 'codex' as const,
          surface: 'cli' as const,
          providerProjectDir: '/sessions',
          capabilities: ['conversations' as const],
        },
      ],
    });

    assert.deepEqual(project.agents?.[0]?.capabilities, [
      'conversations',
      'instructions',
      'skills',
      'rules',
      'subagents',
      'hooks',
      'permissions',
      'mcp',
      'native-config',
    ]);
    assert.equal(project.agents?.[0]?.providerProjectDir, '/sessions');
  });
});
