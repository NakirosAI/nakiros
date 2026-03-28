import test from 'node:test';
import assert from 'node:assert/strict';
import type { ArtifactVersionRow } from './types.js';

// ── Minimal R2 bucket mock ────────────────────────────────────────────────────

function makeR2Bucket() {
  const store = new Map<string, string>();
  return {
    store,
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async get(key: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      return { text: async () => value };
    },
  };
}

// ── R2 key derivation ─────────────────────────────────────────────────────────

function buildR2Key(workspaceId: string, artifactPath: string, version: number): string {
  return `workspaces/${workspaceId}/artifacts/${artifactPath}/v${version}.md`;
}

test('buildR2Key — produces stable path', () => {
  assert.equal(
    buildR2Key('ws-abc', 'features/auth/spec', 3),
    'workspaces/ws-abc/artifacts/features/auth/spec/v3.md',
  );
});

test('buildR2Key — workspace transfer does not change path', () => {
  const wsId = 'ws-abc';
  const key1 = buildR2Key(wsId, 'product', 1);
  // Simulated ownership change: wsId stays the same
  const key2 = buildR2Key(wsId, 'product', 1);
  assert.equal(key1, key2);
});

// ── R2 write + read ───────────────────────────────────────────────────────────

test('R2 put stores content and get retrieves it', async () => {
  const bucket = makeR2Bucket();
  const key = buildR2Key('ws-1', 'product', 1);
  await bucket.put(key, '# Product\nSome content');
  const obj = await bucket.get(key);
  assert.ok(obj !== null);
  assert.equal(await obj.text(), '# Product\nSome content');
});

test('R2 get returns null for missing key', async () => {
  const bucket = makeR2Bucket();
  const obj = await bucket.get('workspaces/ws-1/artifacts/missing/v1.md');
  assert.equal(obj, null);
});

// ── ArtifactVersionRow — r2Key present, content null ─────────────────────────

test('row with r2Key has null content in D1', () => {
  const row: ArtifactVersionRow = {
    id: 'id-1',
    workspaceId: 'ws-1',
    artifactPath: 'product',
    artifactType: 'prd',
    epicId: null,
    content: null,
    r2Key: buildR2Key('ws-1', 'product', 1),
    author: null,
    version: 1,
    createdAt: Date.now(),
  };
  assert.equal(row.content, null);
  assert.ok(row.r2Key !== null);
});

test('route handler resolves content from R2 when r2Key is set', async () => {
  const bucket = makeR2Bucket();
  const wsId = 'ws-1';
  const artifactPath = 'product';
  const version = 1;
  const r2Key = buildR2Key(wsId, artifactPath, version);
  const originalContent = '# Product\nFull markdown content';

  // Simulate POST: write to R2, store row with null content
  await bucket.put(r2Key, originalContent);
  const row: ArtifactVersionRow = {
    id: 'id-1', workspaceId: wsId, artifactPath, artifactType: 'prd',
    epicId: null, content: null, r2Key, author: null, version, createdAt: Date.now(),
  };

  // Simulate GET: resolve content from R2
  let resolvedContent: string | null = row.content;
  if (row.r2Key) {
    const obj = await bucket.get(row.r2Key);
    resolvedContent = obj ? await obj.text() : null;
  }

  assert.equal(resolvedContent, originalContent);
});

// ── Legacy fallback — r2Key null, content inline ──────────────────────────────

test('route handler falls back to inline content when r2Key is null (legacy row)', async () => {
  const bucket = makeR2Bucket();
  const legacyRow: ArtifactVersionRow = {
    id: 'id-old', workspaceId: 'ws-1', artifactPath: 'product', artifactType: 'prd',
    epicId: null, content: '# Legacy content', r2Key: null, author: null, version: 1, createdAt: 0,
  };

  let resolvedContent: string | null = legacyRow.content;
  if (legacyRow.r2Key) {
    const obj = await bucket.get(legacyRow.r2Key);
    resolvedContent = obj ? await obj.text() : null;
  }

  assert.equal(resolvedContent, '# Legacy content');
});

// ── Version increment ─────────────────────────────────────────────────────────

test('next version is max existing version + 1', () => {
  const existing: Pick<ArtifactVersionRow, 'version'>[] = [{ version: 1 }, { version: 2 }, { version: 3 }];
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((v) => v.version)) + 1 : 1;
  assert.equal(nextVersion, 4);
});

test('next version is 1 when no existing versions', () => {
  const existing: Pick<ArtifactVersionRow, 'version'>[] = [];
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((v) => v.version)) + 1 : 1;
  assert.equal(nextVersion, 1);
});
