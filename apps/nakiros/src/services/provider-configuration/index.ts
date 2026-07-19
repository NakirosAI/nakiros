import type { ConfigurationProvider } from '@nakiros/shared';

import type { McpConfigurationAdapter } from './adapter.js';
import { claudeMcpConfigurationAdapter } from './claude-mcp-adapter.js';
import { codexMcpConfigurationAdapter } from './codex-mcp-adapter.js';

export type { McpConfigurationAdapter } from './adapter.js';
export { claudeMcpConfigurationAdapter } from './claude-mcp-adapter.js';
export { codexMcpConfigurationAdapter } from './codex-mcp-adapter.js';
export { validateCanonicalMcp } from './mcp-validation.js';

const MCP_ADAPTERS: Record<ConfigurationProvider, McpConfigurationAdapter> = {
  claude: claudeMcpConfigurationAdapter,
  codex: codexMcpConfigurationAdapter,
};

/** Selects native syntax from the explicit run target, never from source content. */
export function getMcpConfigurationAdapter(
  provider: ConfigurationProvider,
): McpConfigurationAdapter {
  return MCP_ADAPTERS[provider];
}
