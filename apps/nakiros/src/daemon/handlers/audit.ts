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
  finishAudit,
  getAuditBufferedEvents,
} from '../../services/audit-runner.js';
import { resolveEvalSkillDir } from './skill-dir.js';
import { createEventBroadcaster, getRunOrThrow, resolveSkillDirForRun } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastAuditEvent = createEventBroadcaster<AuditRunEvent>('audit:event');

/**
 * Registers the `audit:*` IPC channels — static skill review via the
 * `/nakiros-skill-factory audit` flow.
 *
 * Channels:
 * - Lifecycle: `audit:start`, `audit:stopRun`, `audit:getRun`, `audit:finish`
 * - Stream: `audit:sendUserMessage`, `audit:listActive`, `audit:getBufferedEvents`
 * - History: `audit:listHistory`, `audit:readReport` (reads archived report from `{skill}/audits/`)
 *
 * Broadcasts `audit:event` via `eventBus.broadcast` while runs are active.
 */
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
    const run = getRunOrThrow(getAuditRun, runId, 'Audit');
    const skillDir = resolveSkillDirForRun(run);
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

  'audit:finish': (args) => {
    finishAudit(args[0] as string);
  },

  'audit:getBufferedEvents': (args) => getAuditBufferedEvents(args[0] as string),
};
