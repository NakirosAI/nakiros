import type { ConfigurationProvider, McpTargetContext } from '@nakiros/shared';

/**
 * Resolve which agent CLI runs a `nakiros-mcp-expert` run (audit or fix
 * runner). Only MCP targets can carry a non-Claude provider today (Hestia
 * multi-agent effort, increment 2 — see `McpTargetContext.provider`); every
 * other run kind (skill, claudemd, rules, subagents, hooks, permissions,
 * output-styles) has no `provider` field at all and always resolves to
 * `'claude'`. Absence of `mcpTarget` or of `mcpTarget.provider` also
 * defaults to `'claude'` — back-compat with runs persisted before
 * provider-awareness shipped.
 *
 * Shared by `audit-runner.ts` and `fix-runner.ts`'s `spec.agentProvider` so
 * the one-line policy isn't duplicated (and drifts) between the two.
 */
export function resolveMcpAgentProvider(mcpTarget?: McpTargetContext): 'claude' | 'codex' {
  return mcpTarget?.provider === 'codex' ? 'codex' : 'claude';
}

/** Resolve an explicitly selected Hestia provider, preserving Claude as the
 * back-compatible default for persisted runs that predate provider fields. */
export function resolveConfigurationAgentProvider(
  provider?: ConfigurationProvider,
): 'claude' | 'codex' {
  return provider === 'codex' ? 'codex' : 'claude';
}
