import type {
  CanonicalMcpConfiguration,
  ConfigurationAdapterResult,
  ConfigurationProvider,
} from '@nakiros/shared';

/** Deterministic boundary between shared expert intent and native provider syntax. */
export interface McpConfigurationAdapter {
  readonly provider: ConfigurationProvider;
  readonly artifact: 'mcp';
  parse(source: string): ConfigurationAdapterResult<CanonicalMcpConfiguration>;
  render(configuration: CanonicalMcpConfiguration): ConfigurationAdapterResult<string>;
}
