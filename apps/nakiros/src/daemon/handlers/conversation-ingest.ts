import type {
  ConversationIngestHookDiff,
  ConversationIngestMutationResult,
  ConversationIngestProject,
  ConversationIngestSession,
  ConversationIngestStatus,
} from '@nakiros/shared';

import {
  aggregateStats,
  drainQueue,
  fullScan,
  getClaudeGlobalSettingsPath,
  getIngestHookScriptPath,
  getQueueLength,
  installHook,
  isHookInstalled,
  isWatcherRunning,
  listAllSessions,
  listProjects,
  listSessionsForProject,
  previewHookDiff,
  purgeIngestData,
  startWatcher,
  stopWatcher,
  uninstallHook,
} from '../../services/conversation-ingest/index.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';

/**
 * `conversationIngest:*` IPC channels — opt-in pipeline that captures Claude
 * Code session JSONL files via a global `Stop` hook + chokidar watcher and
 * persists turns under `~/.nakiros/ingest/projects/<encoded>/`. Sessions are
 * tagged `user` or `synthetic`; the UI hides synthetic projects (sandbox /
 * eval iterations / nakiros-internal workdirs) by default.
 */

function buildStatus(): ConversationIngestStatus {
  const hookInstalled = isHookInstalled();
  const watcherRunning = isWatcherRunning();
  const stats = aggregateStats();
  return {
    enabled: hookInstalled && watcherRunning,
    hookInstalled,
    hookScriptPath: getIngestHookScriptPath(),
    settingsPath: getClaudeGlobalSettingsPath(),
    totalProjects: stats.totalProjects,
    totalSessions: stats.totalSessions,
    totalTurns: stats.totalTurns,
    lastIngestAt: stats.lastIngestAt,
    queueLength: getQueueLength(),
  };
}

export const conversationIngestHandlers: HandlerRegistry = {
  'conversationIngest:status': createTypedHandler(
    (): ConversationIngestStatus => buildStatus(),
  ),

  'conversationIngest:previewHookDiff': createTypedHandler(
    (): ConversationIngestHookDiff => previewHookDiff(),
  ),

  'conversationIngest:enable': createTypedHandler(
    (): ConversationIngestMutationResult => {
      try {
        installHook();
      } catch (err) {
        return {
          ok: false,
          code: 'settings-write-failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      try {
        startWatcher();
      } catch (err) {
        return {
          ok: false,
          code: 'settings-write-failed',
          message: `Hook installed but watcher failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      return { ok: true, status: buildStatus() };
    },
  ),

  'conversationIngest:disable': createTypedHandler(
    (): ConversationIngestMutationResult => {
      try {
        stopWatcher();
        uninstallHook();
      } catch (err) {
        return {
          ok: false,
          code: 'settings-write-failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      return { ok: true, status: buildStatus() };
    },
  ),

  'conversationIngest:purge': createTypedHandler(
    (): ConversationIngestMutationResult => {
      try {
        purgeIngestData();
      } catch (err) {
        return {
          ok: false,
          code: 'purge-failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      return { ok: true, status: buildStatus() };
    },
  ),

  'conversationIngest:runNow': createTypedHandler(
    async (): Promise<ConversationIngestMutationResult> => {
      try {
        drainQueue();
        fullScan();
      } catch (err) {
        return {
          ok: false,
          code: 'scan-failed',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      return { ok: true, status: buildStatus() };
    },
  ),

  'conversationIngest:listProjects': createTypedHandler(
    (): ConversationIngestProject[] => listProjects(),
  ),

  'conversationIngest:listSessions': createTypedHandler(
    (projectPath?: string): ConversationIngestSession[] =>
      projectPath ? listSessionsForProject(projectPath) : listAllSessions(),
  ),
};
