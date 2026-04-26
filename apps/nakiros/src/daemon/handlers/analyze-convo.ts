import type { AnalyzeConvoRunEvent, StartAnalyzeConvoRequest } from '@nakiros/shared';

import {
  finishAnalyzeConvo,
  getAnalyzeConvoBufferedEvents,
  getAnalyzeConvoProviderDir,
  getAnalyzeConvoRun,
  listActiveAnalyzeConvoRuns,
  listAllAnalyzeConvoRuns,
  sendAnalyzeConvoUserMessage,
  startAnalyzeConvo,
  stopAnalyzeConvo,
} from '../../services/analyze-convo-runner.js';
import { getProject } from '../../services/project-scanner.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  withBroadcastOnError,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastAnalyzeConvoEvent = createEventBroadcaster<AnalyzeConvoRunEvent>('analyzeConvo:event');

function resolveProviderDir(projectId: string): string {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  return project.providerProjectDir;
}

/**
 * Registers the `analyzeConvo:*` IPC channels — streaming deep analysis of a
 * Claude Code conversation, promoted from the legacy one-shot
 * `project:deepAnalyzeConversation` to a first-class Run kind.
 *
 * Channels:
 * - Lifecycle: `analyzeConvo:start`, `analyzeConvo:stopRun`, `analyzeConvo:getRun`, `analyzeConvo:finish`
 * - Stream: `analyzeConvo:sendUserMessage`, `analyzeConvo:getBufferedEvents`
 * - Listings: `analyzeConvo:listActive`, `analyzeConvo:listAll`
 *
 * Broadcasts `analyzeConvo:event` via `eventBus.broadcast` while runs are active.
 */
export const analyzeConvoHandlers: HandlerRegistry = {
  'analyzeConvo:start': createTypedHandler((request: StartAnalyzeConvoRequest) => {
    const providerProjectDir = resolveProviderDir(request.projectId);
    return startAnalyzeConvo(request, {
      providerProjectDir,
      onEvent: broadcastAnalyzeConvoEvent,
    });
  }),

  'analyzeConvo:stopRun': createTypedHandler(
    withBroadcastOnError('analyzeConvo:event', stopAnalyzeConvo, (runId: string) => runId),
  ),

  'analyzeConvo:getRun': createTypedHandler(getAnalyzeConvoRun),

  'analyzeConvo:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'analyzeConvo:event',
      async (runId: string, message: string) => {
        const providerProjectDir = getAnalyzeConvoProviderDir(runId);
        if (!providerProjectDir) throw new Error(`Analyze-convo run not found: ${runId}`);
        await sendAnalyzeConvoUserMessage(runId, message, {
          providerProjectDir,
          onEvent: broadcastAnalyzeConvoEvent,
        });
      },
      (runId) => runId,
    ),
  ),

  'analyzeConvo:finish': createTypedHandler(
    withBroadcastOnError('analyzeConvo:event', finishAnalyzeConvo, (runId: string) => runId),
  ),

  'analyzeConvo:listActive': createTypedHandler(listActiveAnalyzeConvoRuns),

  'analyzeConvo:listAll': createTypedHandler(listAllAnalyzeConvoRuns),

  'analyzeConvo:getBufferedEvents': createTypedHandler(getAnalyzeConvoBufferedEvents),
};
