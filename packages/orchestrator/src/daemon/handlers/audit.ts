import type {
  AuditRunEvent,
  StartAuditRequest,
  StartEvalRunRequest,
} from '@nakiros/shared';

import {
  startAudit,
  stopAudit,
  getAuditRun,
  sendAuditUserMessage,
  listAuditHistory,
  readAuditReport,
  listActiveAuditRuns,
} from '../../services/audit-runner.js';
import { eventBus } from '../event-bus.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import type { HandlerRegistry } from './index.js';

function broadcastAuditEvent(event: AuditRunEvent): void {
  eventBus.broadcast('audit:event', event);
}

export const auditHandlers: HandlerRegistry = {
  'audit:start': (args) => {
    const request = args[0] as StartAuditRequest;
    const skillDir = resolveEvalSkillDir(request as unknown as StartEvalRunRequest);
    return startAudit(request, { skillDir, onEvent: broadcastAuditEvent });
  },

  'audit:stopRun': (args) => {
    stopAudit(args[0] as string);
  },

  'audit:getRun': (args) => getAuditRun(args[0] as string),

  'audit:sendUserMessage': async (args) => {
    const runId = args[0] as string;
    const message = args[1] as string;
    const run = getAuditRun(runId);
    if (!run) throw new Error(`Audit run not found: ${runId}`);
    const skillDir = resolveEvalSkillDir({
      scope: run.scope,
      projectId: run.projectId,
      skillName: run.skillName,
    } as StartEvalRunRequest);
    await sendAuditUserMessage(runId, message, {
      skillDir,
      onEvent: broadcastAuditEvent,
    });
  },

  'audit:listHistory': (args) => {
    const request = args[0] as StartEvalRunRequest;
    const skillDir = resolveEvalSkillDir(request);
    return listAuditHistory(skillDir);
  },

  'audit:readReport': (args) => readAuditReport(args[0] as string),

  'audit:listActive': () => listActiveAuditRuns(),
};
