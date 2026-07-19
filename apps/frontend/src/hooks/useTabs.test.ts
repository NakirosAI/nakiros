import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTabOpen, type Tab } from './useTabs.js';

test('opening a different run creates and focuses a new run tab synchronously', () => {
  const current: Tab[] = [
    { id: 'home', kind: 'home', label: 'Home' },
    { id: 'claude-run-tab', kind: 'run', runId: 'audit-claude', runKind: 'audit', label: 'Audit · CLAUDE.md' },
  ];
  const result = resolveTabOpen(
    current,
    { kind: 'run', runId: 'audit-codex', runKind: 'audit', label: 'Audit · AGENTS.md' },
    () => 'codex-run-tab',
  );

  assert.equal(result.focusedId, 'codex-run-tab');
  assert.equal(result.tabs.length, 3);
  assert.equal(result.tabs[2]?.kind, 'run');
  assert.equal(result.tabs[2]?.label, 'Audit · AGENTS.md');
});

test('opening the same run focuses its existing tab without duplicating it', () => {
  const current: Tab[] = [
    { id: 'existing', kind: 'run', runId: 'audit-codex', runKind: 'audit', label: 'Audit · AGENTS.md' },
  ];
  const result = resolveTabOpen(
    current,
    { kind: 'run', runId: 'audit-codex', runKind: 'audit', label: 'Audit · AGENTS.md' },
    () => 'unused',
  );

  assert.equal(result.focusedId, 'existing');
  assert.strictEqual(result.tabs, current);
});
