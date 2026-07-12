import type { ApproveBootstrapPlanRequest, BootstrapRunEvent, StartBootstrapRequest } from '@nakiros/shared';

import {
  approveBootstrapPlan,
  finishBootstrap,
  getBootstrapBufferedEvents,
  getBootstrapRun,
  getBootstrapTimeline,
  getBootstrapUsage,
  listActiveBootstrapRuns,
  listAllBootstrapRuns,
  sendBootstrapUserMessage,
  startBootstrap,
  stopBootstrap,
} from '../../services/bootstrap-runner.js';
import { resolveSkillDir } from './skill-dir.js';
import { createEventBroadcaster, createTypedHandler, withBroadcastOnError } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/** Name of the bundled orchestrator skill — singleton, no per-request scope/skillName like audit/fix. */
const BOOTSTRAP_SKILL_NAME = 'nakiros-project-bootstrap';

const broadcastBootstrapEvent = createEventBroadcaster<BootstrapRunEvent>('bootstrap:event');

/**
 * Registers the `bootstrap:*` IPC channels — the interactive plan → discuss
 * → approve → execute lifecycle for the Project `.claude` Bootstrap feature
 * (`docs/redesign/features/project-bootstrap.md`). Mirrors the `audit:*`
 * handler surface; `approvePlan` is the one bootstrap-specific addition.
 *
 * Channels:
 * - Lifecycle: `bootstrap:start`, `bootstrap:stopRun`, `bootstrap:getRun`, `bootstrap:finish`
 * - Discussion: `bootstrap:sendUserMessage` (accepted while `waiting_for_input` or `awaiting_approval`)
 * - Validation: `bootstrap:approvePlan` (applies per-proposal decisions, moves the run to `executing`)
 * - Stream: `bootstrap:event`, `bootstrap:getBufferedEvents`
 * - Listing: `bootstrap:listActive`, `bootstrap:listAll`
 * - History: `bootstrap:getTimeline`, `bootstrap:getUsage`
 *
 * Broadcasts `bootstrap:event` via `eventBus.broadcast` while runs are active.
 */
export const bootstrapHandlers: HandlerRegistry = {
  'bootstrap:start': createTypedHandler((request: StartBootstrapRequest) => {
    const skillDir = resolveSkillDir({ scope: 'nakiros-bundled', skillName: BOOTSTRAP_SKILL_NAME });
    return startBootstrap(request, { skillDir, onEvent: broadcastBootstrapEvent });
  }),

  'bootstrap:stopRun': createTypedHandler(
    withBroadcastOnError('bootstrap:event', stopBootstrap, (runId: string) => runId),
  ),

  'bootstrap:getRun': createTypedHandler(getBootstrapRun),

  'bootstrap:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'bootstrap:event',
      async (runId: string, message: string) => {
        await sendBootstrapUserMessage(runId, message, { onEvent: broadcastBootstrapEvent });
      },
      (runId) => runId,
    ),
  ),

  'bootstrap:approvePlan': createTypedHandler(
    withBroadcastOnError(
      'bootstrap:event',
      (request: ApproveBootstrapPlanRequest) => approveBootstrapPlan(request, { onEvent: broadcastBootstrapEvent }),
      (request) => request.runId,
    ),
  ),

  'bootstrap:finish': createTypedHandler(
    withBroadcastOnError('bootstrap:event', finishBootstrap, (runId: string) => runId),
  ),

  'bootstrap:listActive': createTypedHandler(listActiveBootstrapRuns),

  'bootstrap:listAll': createTypedHandler(listAllBootstrapRuns),

  'bootstrap:getBufferedEvents': createTypedHandler(getBootstrapBufferedEvents),

  'bootstrap:getTimeline': createTypedHandler(getBootstrapTimeline),

  'bootstrap:getUsage': createTypedHandler(getBootstrapUsage),
};
