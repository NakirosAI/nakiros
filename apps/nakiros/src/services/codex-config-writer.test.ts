import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { codexConfigPath, readCodexConfig, saveCodexConfig } from './codex-config-writer.js';

const tempProjects: string[] = [];

function tempProject(): string {
  const path = mkdtempSync(join(tmpdir(), 'nakiros-codex-config-'));
  tempProjects.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempProjects.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('Codex native config writer', () => {
  it('returns an editable empty file when config.toml is absent', () => {
    const projectPath = tempProject();

    assert.deepEqual(readCodexConfig(projectPath), {
      ok: true,
      file: {
        content: '',
        mtime: '',
        exists: false,
        path: codexConfigPath(projectPath),
      },
    });
  });

  it('creates .codex and preserves the submitted TOML source exactly', () => {
    const projectPath = tempProject();
    const content = '# Keep this comment\nmodel = "gpt-5.4"\n\n[features]\nmulti_agent = true\n';

    const result = saveCodexConfig(projectPath, content, '');

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.file.content, content);
    assert.equal(result.file.exists, true);
    assert.notEqual(result.file.mtime, '');
    assert.equal(readFileSync(codexConfigPath(projectPath), 'utf8'), content);
    assert.deepEqual(readdirSync(join(projectPath, '.codex')), ['config.toml']);
  });

  it('rejects invalid TOML without creating the config file', () => {
    const projectPath = tempProject();
    const result = saveCodexConfig(projectPath, 'model = [', '');

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'invalid-toml');
    assert.equal(readCodexConfig(projectPath).ok, true);
    assert.equal(readFileExists(codexConfigPath(projectPath)), false);
  });

  it('rejects a save when an existing file changed after read', () => {
    const projectPath = tempProject();
    const path = codexConfigPath(projectPath);
    mkdirSync(join(projectPath, '.codex'));
    writeFileSync(path, 'model = "old"\n', 'utf8');
    const read = readCodexConfig(projectPath);
    assert.equal(read.ok, true);
    if (!read.ok) return;

    writeFileSync(path, 'model = "external"\n', 'utf8');
    const future = new Date(Date.now() + 5_000);
    utimesSync(path, future, future);

    const result = saveCodexConfig(projectPath, 'model = "new"\n', read.file.mtime);
    assert.deepEqual(result, {
      ok: false,
      code: 'conflict',
      message: 'Codex config was modified externally.',
    });
    assert.equal(readFileSync(path, 'utf8'), 'model = "external"\n');
  });

  it('rejects a save when a file was created after an absent read', () => {
    const projectPath = tempProject();
    const path = codexConfigPath(projectPath);
    const read = readCodexConfig(projectPath);
    assert.equal(read.ok, true);
    if (!read.ok) return;

    mkdirSync(join(projectPath, '.codex'));
    writeFileSync(path, 'model = "external"\n', 'utf8');

    const result = saveCodexConfig(projectPath, 'model = "new"\n', read.file.mtime);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'conflict');
  });

  it('refuses a symlinked .codex directory without writing outside the project', () => {
    const projectPath = tempProject();
    const externalPath = tempProject();
    symlinkSync(externalPath, join(projectPath, '.codex'), 'dir');

    const result = saveCodexConfig(projectPath, 'model = "new"\n', '');

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'unsafe-path');
    assert.equal(readFileExists(join(externalPath, 'config.toml')), false);
  });

  it('refuses a symlinked config.toml without changing its target', () => {
    const projectPath = tempProject();
    const externalPath = join(tempProject(), 'external.toml');
    mkdirSync(join(projectPath, '.codex'));
    writeFileSync(externalPath, 'model = "external"\n', 'utf8');
    symlinkSync(externalPath, codexConfigPath(projectPath), 'file');

    const read = readCodexConfig(projectPath);
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.code, 'unsafe-path');

    const result = saveCodexConfig(projectPath, 'model = "new"\n', '');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'unsafe-path');
    assert.equal(readFileSync(externalPath, 'utf8'), 'model = "external"\n');
  });
});

function readFileExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}
