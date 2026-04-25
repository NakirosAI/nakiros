import type { AgentInstallRequest } from '@nakiros/shared';
import {
  getAgentInstallStatus,
  getGlobalInstallStatus,
  getInstalledCommands,
  installAgents,
  installAgentsGlobally,
} from '../../services/agent-installer.js';
import { getAgentCliStatus } from '../../services/agent-cli.js';
import type { HandlerRegistry } from './index.js';

/**
 * Registers the `agents:*` IPC channels — skill-command installer status and actions.
 *
 * Channels:
 * - `agents:status` — install status for a given repo across every supported environment
 * - `agents:global-status` — install status for the user-global (`~/.claude`) environment
 * - `agents:installed-commands` — list of Nakiros commands currently installed
 * - `agents:cli-status` — checks whether the `claude` / `cursor` / `codex` CLIs are on PATH
 * - `agents:install` — installs Nakiros commands into the selected environments for one repo
 * - `agents:install-global` — installs into the user-global environment
 */
export const agentsHandlers: HandlerRegistry = {
  'agents:status': (args) => getAgentInstallStatus(args[0] as string),
  'agents:global-status': () => getGlobalInstallStatus(),
  'agents:installed-commands': () => getInstalledCommands(),
  'agents:cli-status': () => getAgentCliStatus(),
  'agents:install': (args) => installAgents(args[0] as AgentInstallRequest),
  'agents:install-global': () => installAgentsGlobally(),
};
