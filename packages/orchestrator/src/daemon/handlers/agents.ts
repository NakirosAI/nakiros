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

export const agentsHandlers: HandlerRegistry = {
  'agents:status': (args) => getAgentInstallStatus(args[0] as string),
  'agents:global-status': () => getGlobalInstallStatus(),
  'agents:installed-commands': () => getInstalledCommands(),
  'agents:cli-status': () => getAgentCliStatus(),
  'agents:install': (args) => installAgents(args[0] as AgentInstallRequest),
  'agents:install-global': () => installAgentsGlobally(),
};
