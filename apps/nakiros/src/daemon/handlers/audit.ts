import type { AuditRunEvent, StartAuditRequest } from '@nakiros/shared';

import {
  startAudit,
  stopAudit,
  getAuditRun,
  sendAuditUserMessage,
  listAuditHistory,
  readAuditReport,
  listActiveAuditRuns,
  listAllAuditRuns,
  finishAudit,
  getAuditBufferedEvents,
} from '../../services/audit-runner.js';
import { resolveSkillDir, type SkillScopeRef } from './skill-dir.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  getRunOrThrow,
  resolveSkillDirForRun,
} from './run-helpers.js';
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
  'audit:start': createTypedHandler((request: StartAuditRequest) => {
    const skillDir = resolveSkillDir(request);
    return startAudit(request, { skillDir, onEvent: broadcastAuditEvent });
  }),

  'audit:stopRun': createTypedHandler(stopAudit),

  'audit:getRun': createTypedHandler(getAuditRun),

  'audit:sendUserMessage': createTypedHandler(async (runId: string, message: string) => {
    const run = getRunOrThrow(getAuditRun, runId, 'Audit');
    const skillDir = resolveSkillDirForRun(run);
    await sendAuditUserMessage(runId, message, { skillDir, onEvent: broadcastAuditEvent });
  }),

  'audit:listHistory': createTypedHandler((request: SkillScopeRef) => {
    const skillDir = resolveSkillDir(request);
    return listAuditHistory(skillDir);
  }),

  'audit:readReport': createTypedHandler(readAuditReport),

  'audit:listActive': createTypedHandler(listActiveAuditRuns),

  'audit:listAll': createTypedHandler(listAllAuditRuns),

  'audit:finish': createTypedHandler(finishAudit),

  'audit:getBufferedEvents': createTypedHandler(getAuditBufferedEvents),
};
