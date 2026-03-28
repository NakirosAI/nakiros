import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildNakirosMcpServerEntry, upsertNakirosMcpConfig } from './mcp-config.js';

test('buildNakirosMcpServerEntry includes auth headers only when a token is provided', () => {
  assert.deepEqual(
    buildNakirosMcpServerEntry('ws-1', 'http://localhost:3737', 'token-123'),
    {
      type: 'http',
      url: 'http://localhost:3737/ws/ws-1/mcp',
      headers: { Authorization: 'Bearer token-123' },
    },
  );

  assert.deepEqual(
    buildNakirosMcpServerEntry('ws-1', 'http://localhost:3737'),
    {
      type: 'http',
      url: 'http://localhost:3737/ws/ws-1/mcp',
    },
  );
});

test('upsertNakirosMcpConfig preserves existing config while replacing the nakiros entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nakiros-mcp-config-'));
  const configPath = join(dir, 'claude.json');

  upsertNakirosMcpConfig(configPath, 'ws-1', 'http://localhost:3737');
  upsertNakirosMcpConfig(configPath, 'ws-2', 'https://api.nakiros.com', 'token-123');

  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
    mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
  };

  assert.deepEqual(config.mcpServers.nakiros, {
    type: 'http',
    url: 'https://api.nakiros.com/ws/ws-2/mcp',
    headers: { Authorization: 'Bearer token-123' },
  });
});
