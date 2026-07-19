import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CanonicalMcpConfiguration } from '@nakiros/shared';

import {
  claudeMcpConfigurationAdapter,
  codexMcpConfigurationAdapter,
  getMcpConfigurationAdapter,
  validateCanonicalMcp,
} from './index.js';

function commonSemantics(configuration: CanonicalMcpConfiguration): unknown {
  return configuration.servers.map(({ extensions: _extensions, ...server }) => server);
}

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected a successful adapter result.');
  return result.value;
}

describe('provider-safe MCP configuration adapters', () => {
  it('round-trips Claude JSON and preserves Claude-only keys', () => {
    const source = JSON.stringify({
      projectMetadata: { owner: 'platform' },
      mcpServers: {
        filesystem: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
          env: { LOG_LEVEL: 'warn' },
          customClaudeOption: true,
        },
      },
    });

    const parsed = value(claudeMcpConfigurationAdapter.parse(source));
    assert.deepEqual(parsed.extensions?.claude, {
      projectMetadata: { owner: 'platform' },
    });
    assert.deepEqual(parsed.servers[0]?.extensions?.claude, { customClaudeOption: true });

    const rendered = value(claudeMcpConfigurationAdapter.render(parsed));
    const reparsed = value(claudeMcpConfigurationAdapter.parse(rendered));
    assert.deepEqual(reparsed, parsed);
  });

  it('round-trips Codex TOML and preserves provider-only fields', () => {
    const source = [
      '[mcp_servers.docs]',
      'url = "https://example.test/mcp"',
      'enabled = true',
      'startup_timeout_sec = 15',
      'enabled_tools = ["search", "open"]',
      'bearer_token_env_var = "DOCS_TOKEN"',
      '',
      '[mcp_servers.docs.http_headers]',
      'X-Client = "nakiros"',
      '',
    ].join('\n');

    const parsed = value(codexMcpConfigurationAdapter.parse(source));
    assert.deepEqual(parsed.servers[0]?.extensions?.codex, {
      enabled: true,
      startup_timeout_sec: 15,
      enabled_tools: ['search', 'open'],
      bearer_token_env_var: 'DOCS_TOKEN',
    });
    assert.deepEqual(parsed.servers[0]?.headers, { 'X-Client': 'nakiros' });

    const rendered = value(codexMcpConfigurationAdapter.render(parsed));
    const reparsed = value(codexMcpConfigurationAdapter.parse(rendered));
    assert.deepEqual(reparsed, parsed);
  });

  it('converts shared semantics without leaking source-provider extensions', () => {
    const claude = value(claudeMcpConfigurationAdapter.parse(JSON.stringify({
      mcpServers: {
        api: {
          type: 'http',
          url: 'https://example.test/mcp',
          headers: { Authorization: 'Bearer test' },
          claudeOnly: 'discard-on-codex-render',
        },
      },
    })));

    const codexSource = value(codexMcpConfigurationAdapter.render(claude));
    assert.match(codexSource, /^\[mcp_servers\.api\]/);
    assert.doesNotMatch(codexSource, /claudeOnly/);
    const codex = value(codexMcpConfigurationAdapter.parse(codexSource));
    assert.deepEqual(commonSemantics(codex), commonSemantics(claude));

    const claudeSource = value(claudeMcpConfigurationAdapter.render(codex));
    assert.doesNotThrow(() => JSON.parse(claudeSource));
    assert.deepEqual(
      commonSemantics(value(claudeMcpConfigurationAdapter.parse(claudeSource))),
      commonSemantics(codex),
    );
  });

  it('selects syntax only from the explicit provider', () => {
    assert.equal(getMcpConfigurationAdapter('claude').provider, 'claude');
    assert.equal(getMcpConfigurationAdapter('codex').provider, 'codex');
    assert.equal(claudeMcpConfigurationAdapter.parse('[mcp_servers.docs]').ok, false);
    assert.equal(codexMcpConfigurationAdapter.parse('{"mcpServers":{}}').ok, false);
  });

  it('rejects invalid canonical MCP intent before serialization', () => {
    const configuration: CanonicalMcpConfiguration = {
      artifact: 'mcp',
      servers: [
        { name: 'bad name', transport: 'stdio' },
        { name: 'duplicate', transport: 'http' },
        { name: 'duplicate', transport: 'stdio', command: 'node' },
      ],
    };

    const diagnostics = validateCanonicalMcp(configuration);
    assert.deepEqual(
      new Set(diagnostics.map((diagnostic) => diagnostic.code)),
      new Set([
        'invalid-server-name',
        'stdio-command-required',
        'remote-url-required',
        'duplicate-server-name',
      ]),
    );
    assert.equal(claudeMcpConfigurationAdapter.render(configuration).ok, false);
    assert.equal(codexMcpConfigurationAdapter.render(configuration).ok, false);
  });

  it('rejects typed native fields instead of dropping them silently', () => {
    const claude = claudeMcpConfigurationAdapter.parse(JSON.stringify({
      mcpServers: {
        bad: { command: 'node', env: { PORT: 3000 } },
      },
    }));
    assert.equal(claude.ok, false);
    assert.ok(claude.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-env'));

    const codex = codexMcpConfigurationAdapter.parse([
      '[mcp_servers.bad]',
      'command = "node"',
      'args = ["ok", 2]',
    ].join('\n'));
    assert.equal(codex.ok, false);
    assert.ok(codex.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-args'));
  });

  it('rejects unsupported opaque Codex values instead of emitting invalid TOML', () => {
    const configuration: CanonicalMcpConfiguration = {
      artifact: 'mcp',
      servers: [{
        name: 'local',
        transport: 'stdio',
        command: 'node',
        extensions: { codex: { unsupported: [{ nested: true }] } },
      }],
    };

    const result = codexMcpConfigurationAdapter.render(configuration);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(
      (diagnostic) => diagnostic.code === 'unsupported-codex-extension',
    ));
  });

  it('validates untrusted runtime payloads and unsupported provider capabilities', () => {
    const invalidRuntime = {
      artifact: 'mcp',
      servers: [{ name: 'runtime', transport: 'stdio', command: 42, args: ['ok', false] }],
    } as unknown as CanonicalMcpConfiguration;
    const runtimeResult = claudeMcpConfigurationAdapter.render(invalidRuntime);
    assert.equal(runtimeResult.ok, false);
    assert.ok(runtimeResult.diagnostics.some(
      (diagnostic) => diagnostic.code === 'invalid-command',
    ));
    assert.ok(runtimeResult.diagnostics.some(
      (diagnostic) => diagnostic.code === 'invalid-args',
    ));

    const sse: CanonicalMcpConfiguration = {
      artifact: 'mcp',
      servers: [{ name: 'legacy', transport: 'sse', url: 'https://example.test/sse' }],
    };
    const codexResult = codexMcpConfigurationAdapter.render(sse);
    assert.equal(codexResult.ok, false);
    assert.ok(codexResult.diagnostics.some(
      (diagnostic) => diagnostic.code === 'unsupported-codex-transport',
    ));
  });
});
