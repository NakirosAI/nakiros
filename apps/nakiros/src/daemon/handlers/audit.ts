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
  getAuditTimeline,
  getAuditUsage,
} from '../../services/audit-runner.js';
import { resolveSkillDir, type SkillScopeRef } from './skill-dir.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  getRunOrThrow,
  resolveSkillDirForRun,
  withBroadcastOnError,
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

  'audit:stopRun': createTypedHandler(
    withBroadcastOnError('audit:event', stopAudit, (runId: string) => runId),
  ),

  'audit:getRun': createTypedHandler(getAuditRun),

  'audit:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'audit:event',
      async (runId: string, message: string) => {
        const run = getRunOrThrow(getAuditRun, runId, 'Audit');
        const skillDir = resolveSkillDirForRun(run);
        await sendAuditUserMessage(runId, message, { skillDir, onEvent: broadcastAuditEvent });
      },
      (runId) => runId,
    ),
  ),

  'audit:listHistory': createTypedHandler((request: SkillScopeRef) => {
    const skillDir = resolveSkillDir(request);
    return listAuditHistory(skillDir);
  }),

  'audit:readReport': createTypedHandler(readAuditReport),

  'audit:listActive': createTypedHandler(listActiveAuditRuns),

  'audit:listAll': createTypedHandler(listAllAuditRuns),

  'audit:finish': createTypedHandler(
    withBroadcastOnError('audit:event', finishAudit, (runId: string) => runId),
  ),

  'audit:getBufferedEvents': createTypedHandler(getAuditBufferedEvents),

  'audit:getTimeline': createTypedHandler(getAuditTimeline),

  'audit:getUsage': createTypedHandler(getAuditUsage),
};
