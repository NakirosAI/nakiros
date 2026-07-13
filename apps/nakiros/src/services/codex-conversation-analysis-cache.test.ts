import assert from 'node:assert/strict';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { listCachedCodexAnalyses } from './codex-conversation-analysis-cache.js';
import { parseCodexConversationFile } from './codex-conversation-parser.js';

const fixture = fileURLToPath(new URL('./__fixtures__/codex-session.jsonl', import.meta.url));
const roots: string[] = [];

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'nakiros-codex-cache-'));
  roots.push(root);
  const sessionsDir = join(root, 'sessions', '2026', '07', '12');
  const cacheRoot = join(root, 'cache');
  mkdirSync(sessionsDir, { recursive: true });
  const source = join(sessionsDir, 'rollout.jsonl');
  copyFileSync(fixture, source);
  return { sessionsDir: join(root, 'sessions'), cacheRoot, source };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Codex conversation analysis cache', () => {
  it('computes cold, avoids parsing warm, invalidates modified files and removes deleted files', () => {
    const { sessionsDir, cacheRoot, source } = setup();
    let parseCount = 0;
    const parseFile: typeof parseCodexConversationFile = (...args) => {
      parseCount++;
      return parseCodexConversationFile(...args);
    };
    const options = { cacheRoot, parseFile };

    assert.equal(listCachedCodexAnalyses(sessionsDir, '/synthetic/project', 'p', options).length, 1);
    assert.equal(parseCount, 1);
    assert.equal(listCachedCodexAnalyses(sessionsDir, '/synthetic/project', 'p', options).length, 1);
    assert.equal(parseCount, 1, 'warm hit must not parse the JSONL');

    appendFileSync(source, '\n');
    assert.equal(listCachedCodexAnalyses(sessionsDir, '/synthetic/project', 'p', options).length, 1);
    assert.equal(parseCount, 2, 'source size change invalidates the entry');

    unlinkSync(source);
    assert.equal(listCachedCodexAnalyses(sessionsDir, '/synthetic/project', 'p', options).length, 0);
    assert.equal(parseCount, 2, 'deleted sources are removed without parsing');
  });

  it('invalidates all entries when the cache version changes', () => {
    const { sessionsDir, cacheRoot } = setup();
    let parseCount = 0;
    const parseFile: typeof parseCodexConversationFile = (...args) => {
      parseCount++;
      return parseCodexConversationFile(...args);
    };

    listCachedCodexAnalyses(sessionsDir, '/synthetic/project', 'p', {
      cacheRoot,
      parseFile,
      cacheVersion: 1,
    });
    listCachedCodexAnalyses(sessionsDir, '/synthetic/project', 'p', {
      cacheRoot,
      parseFile,
      cacheVersion: 2,
    });
    assert.equal(parseCount, 2);
  });
});
