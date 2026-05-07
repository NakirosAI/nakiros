/**
 * Conversation-ingest service barrel — daemon-side hooks needed to enable /
 * disable / inspect the opt-in pipeline that captures Claude Code session
 * JSONL files into `~/.nakiros/ingest/projects/<encoded>/`.
 *
 * V1.0 stores raw turns + a per-project index. V1.1 will add a Haiku
 * classifier on top of `index.projects[].sessions`. V1.2 ships the
 * `.claude/` audit screen consuming the per-project store.
 */

export {
  installHook,
  uninstallHook,
  isHookInstalled,
  previewHookDiff,
} from './hook-installer.js';
export {
  drainQueue,
  ensureProjectIndexed,
  ensureCoworkProjectIndexed,
  fullScan,
  ingestSession,
  getQueueLength,
  aggregateStats,
} from './runner.js';
export { startWatcher, stopWatcher, isWatcherRunning } from './watcher.js';
export {
  listProjects,
  listSessionsForProject,
  listAllSessions,
  purgeIngestData,
  readSessionBody,
  toProjectConversation,
} from './project-store.js';
export {
  getIngestHookScriptPath,
  getClaudeGlobalSettingsPath,
} from './paths.js';
export {
  loadDigest,
  listDigestsForProject,
  persistDigest,
} from './classifier.js';
export {
  buildConversationDigest,
  estimateDigestTokens,
} from './digest-builder.js';
export { parseClassifierJson } from './classifier-parser.js';
