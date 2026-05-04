import type { ClassifyConvoRunEvent, StartClassifyConvoRequest } from '@nakiros/shared';

import {
  finishClassifyConvo,
  getClassifyConvoBufferedEvents,
  getClassifyConvoExtras,
  getClassifyConvoRun,
  listActiveClassifyConvoRuns,
  listAllClassifyConvoRuns,
  sendClassifyConvoUserMessage,
  startClassifyConvo,
  stopClassifyConvo,
} from '../../services/classify-convo-runner.js';
import { getProject } from '../../services/project-scanner.js';
import {
  createEventBroadcaster,
  createTypedHandler,
  withBroadcastOnError,
} from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

const broadcastClassifyConvoEvent = createEventBroadcaster<ClassifyConvoRunEvent>('classifyConvo:event');

function resolveProject(projectId: string): { providerProjectDir: string; projectPath: string } {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  return { providerProjectDir: project.providerProjectDir, projectPath: project.projectPath };
}

/**
 * Registers the `classifyConvo:*` IPC channels — streaming friction
 * classification of a Claude Code conversation, V1.1 of the conversation-
 * ingest pipeline.
 *
 * Mirrors the `analyzeConvo:*` family one-for-one so the frontend can use the
 * same RunSidePanel-style consumer pattern.
 *
 * Channels:
 * - Lifecycle: `classifyConvo:start`, `classifyConvo:stopRun`, `classifyConvo:getRun`, `classifyConvo:finish`
 * - Stream: `classifyConvo:sendUserMessage`, `classifyConvo:getBufferedEvents`
 * - Listings: `classifyConvo:listActive`, `classifyConvo:listAll`
 *
 * Broadcasts `classifyConvo:event` via `eventBus.broadcast` while runs are active.
 */
export const classifyConvoHandlers: HandlerRegistry = {
  'classifyConvo:start': createTypedHandler((request: StartClassifyConvoRequest) => {
    const { providerProjectDir, projectPath } = resolveProject(request.projectId);
    return startClassifyConvo(request, {
      providerProjectDir,
      projectPath,
      onEvent: broadcastClassifyConvoEvent,
    });
  }),

  'classifyConvo:stopRun': createTypedHandler(
    withBroadcastOnError('classifyConvo:event', stopClassifyConvo, (runId: string) => runId),
  ),

  'classifyConvo:getRun': createTypedHandler(getClassifyConvoRun),

  'classifyConvo:sendUserMessage': createTypedHandler(
    withBroadcastOnError(
      'classifyConvo:event',
      async (runId: string, message: string) => {
        const extras = getClassifyConvoExtras(runId);
        if (!extras) throw new Error(`Classify-convo run not found: ${runId}`);
        await sendClassifyConvoUserMessage(runId, message, {
          providerProjectDir: extras.providerProjectDir,
          projectPath: extras.projectPath,
          onEvent: broadcastClassifyConvoEvent,
        });
      },
      (runId) => runId,
    ),
  ),

  'classifyConvo:finish': createTypedHandler(
    withBroadcastOnError('classifyConvo:event', finishClassifyConvo, (runId: string) => runId),
  ),

  'classifyConvo:listActive': createTypedHandler(listActiveClassifyConvoRuns),

  'classifyConvo:listAll': createTypedHandler(listAllClassifyConvoRuns),

  'classifyConvo:getBufferedEvents': createTypedHandler(getClassifyConvoBufferedEvents),
};
