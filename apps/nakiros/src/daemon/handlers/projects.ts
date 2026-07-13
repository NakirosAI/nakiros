import { dirname } from 'node:path';

import {
  scan as scanProjects,
  listProjects,
  getProject,
  dismissProject,
  listDismissedProjects,
  undismissProject,
} from '../../services/project-scanner.js';
import { listConversations, getConversationMessages } from '../../services/conversation-parser.js';
import {
  getCodexConversationMessages,
  listCodexConversations,
} from '../../services/codex-conversation-parser.js';
import {
  getCachedCodexAnalysis,
  listCachedCodexAnalyses,
} from '../../services/codex-conversation-analysis-cache.js';
import { getOrComputeAnalysis } from '../../services/conversation-analysis-cache.js';
import {
  ensureProjectIndexed,
  ensureCoworkProjectIndexed,
  listDigestsForProject,
  listSessionsForProject,
  loadDigest,
  readSessionBody,
  toProjectConversation,
  getSessionTranscriptDir,
} from '../../services/conversation-ingest/index.js';
import {
  loadProjectAggregate,
  loadProjectAggregates,
  refreshProjectAggregate,
} from '../../services/project-aggregate-cache.js';
import {
  conversationFingerprint,
  loadDeepAnalysis,
  runNormalizedDeepAnalysis,
} from '../../services/conversation-deep-analyzer.js';
import {
  codexSessionsDir,
  loadNormalizedProjectConversation,
} from '../../services/project-conversation-source.js';
import { buildArgosAgentComparison } from '../../services/argos-agent-comparison.js';
import {
  listSkills,
  getSkill,
  saveSkill,
  readSkillFile,
  saveSkillFile,
} from '../../services/skill-reader.js';
import { eventBus } from '../event-bus.js';
import { createTypedHandler } from './run-helpers.js';
import type { HandlerRegistry } from './index.js';
import type { Project, ProviderConversationAnalysis } from '@nakiros/shared';

/**
 * Route to the correct lazy indexer based on the project's provider.
 * - `'cowork'`: uses `ensureCoworkProjectIndexed` which walks the Cowork
 *   session groups and keys sessions under `projectPath`.
 * - all others: uses `ensureProjectIndexed` against `providerProjectDir`.
 */
function ensureIndexed(project: Project): void {
  if (project.provider === 'cowork') {
    ensureCoworkProjectIndexed(project.providerProjectDir, project.projectPath);
  } else if (project.provider === 'claude') {
    ensureProjectIndexed(project.providerProjectDir);
  }
}

function listNativeCodexConversations(project: Project, projectId: string) {
  const sessionsDir = codexSessionsDir(project);
  return sessionsDir
    ? listCodexConversations(sessionsDir, project.projectPath, projectId)
    : [];
}

function listProjectAnalyses(
  project: Project,
  projectId: string,
): ProviderConversationAnalysis[] {
  ensureIndexed(project);
  const sessions = listSessionsForProject(project.projectPath);
  const sessionsDir = codexSessionsDir(project);
  const codexAnalyses = sessionsDir
    ? listCachedCodexAnalyses(sessionsDir, project.projectPath, projectId)
    : [];
  if (sessions.length > 0) {
    return [
      ...sessions
        .map((session) => {
          const analysisDir = dirname(session.transcriptPath);
          const analysis = getOrComputeAnalysis(analysisDir, session.sessionId, projectId);
          if (!analysis) return null;
          return session.kind ? { ...analysis, kind: session.kind } : analysis;
        })
        .filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null),
      ...codexAnalyses,
    ];
  }
  const conversations = listConversations(project.providerProjectDir, projectId);
  return [
    ...conversations
      .map((conversation) => {
        const analysis = getOrComputeAnalysis(
          project.providerProjectDir,
          conversation.sessionId,
          projectId,
        );
        if (!analysis) return null;
        return conversation.kind ? { ...analysis, kind: conversation.kind } : analysis;
      })
      .filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null),
    ...codexAnalyses,
  ];
}

/**
 * Registers the `project:*` IPC channels — project scanning, conversation
 * metadata, conversation analysis (deterministic + LLM-powered), and project-
 * scoped skill CRUD.
 *
 * Channels:
 * - `project:scan` — walk provider dirs for Claude Code projects
 * - `project:list`, `project:get`, `project:dismiss`
 * - `project:getStats`, `project:getGlobalStats` (currently stubbed to `null`)
 * - Conversations: `project:listConversations`, `project:getConversationMessages`,
 *   `project:analyzeConversation`, `project:listConversationsWithAnalysis`,
 *   `project:deepAnalyzeConversation`, `project:loadDeepAnalysis`
 * - Skills: `project:listSkills`, `project:getSkill`, `project:saveSkill`,
 *   `project:readSkillFile`, `project:saveSkillFile`
 * - `project:getRecommendations` (currently stubbed to `[]`)
 *
 * Broadcasts `project:scanProgress` via `eventBus.broadcast` while `project:scan` runs.
 */
export const projectHandlers: HandlerRegistry = {
  'project:scan': createTypedHandler(() =>
    scanProjects((provider, current, total, projectName) => {
      eventBus.broadcast('project:scanProgress', {
        provider,
        current,
        total,
        projectName,
      });
    }),
  ),
  'project:list': createTypedHandler(listProjects),
  'project:get': createTypedHandler(getProject),
  'project:dismiss': createTypedHandler(dismissProject),
  'project:listDismissed': createTypedHandler(listDismissedProjects),
  'project:undismiss': createTypedHandler(undismissProject),
  'project:getStats': createTypedHandler(() => null),
  'project:getGlobalStats': createTypedHandler(() => null),

  // listConversations / getConversationMessages now route through the
  // conversation-ingest store (single source of truth for the UI). We
  // ensure the project is up-to-date in the store before reading, so users
  // who haven't opted in to the Stop hook still get fresh data on every
  // project open. The conversation analyzers continue to read the raw JSONL
  // through `providerProjectDir` because they need cache/token/header data
  // that's not preserved in our parsed body files.
  'project:listConversations': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    ensureIndexed(project);
    const sessions = listSessionsForProject(project.projectPath);
    const codex = listNativeCodexConversations(project, projectId);
    if (sessions.length > 0) {
      return [...sessions.map((s) => toProjectConversation(s, projectId)), ...codex].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      );
    }
    // Fallback: project hasn't been indexed (e.g. fresh after purge or the
    // ingest dir was wiped manually) — read the live JSONL.
    const primary =
      project.provider === 'claude'
        ? listConversations(project.providerProjectDir, projectId)
        : [];
    return [...primary, ...codex].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );
  }),

  'project:getConversationMessages': createTypedHandler((projectId: string, sessionId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    ensureIndexed(project);
    const body = readSessionBody(project.projectPath, sessionId);
    if (body) return body.messages;
    const sessionsDir = codexSessionsDir(project);
    if (sessionsDir) {
      const codexMessages = getCodexConversationMessages(
        sessionsDir,
        project.projectPath,
        projectId,
        sessionId,
      );
      if (codexMessages) return codexMessages;
    }
    // Fallback when the session was just deleted from the ingest store.
    return project.provider === 'claude'
      ? getConversationMessages(project.providerProjectDir, sessionId)
      : [];
  }),

  'project:analyzeConversation': createTypedHandler((projectId: string, sessionId: string) => {
    const project = getProject(projectId);
    if (!project) return null;
    const sessionsDir = codexSessionsDir(project);
    if (sessionsDir) {
      const codexAnalysis = getCachedCodexAnalysis(
        sessionsDir,
        project.projectPath,
        projectId,
        sessionId,
      );
      if (codexAnalysis) return codexAnalysis;
    }
    const analysisDir =
      getSessionTranscriptDir(project.projectPath, sessionId) ?? project.providerProjectDir;
    return getOrComputeAnalysis(analysisDir, sessionId, projectId);
  }),

  'project:listConversationsWithAnalysis': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    return listProjectAnalyses(project, projectId);
  }),

  'project:getArgosDashboard': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return null;
    const analyses = listProjectAnalyses(project, projectId);
    return {
      analyses,
      comparison: buildArgosAgentComparison(projectId, analyses),
    };
  }),

  'project:getAggregate': createTypedHandler((projectId: string) =>
    loadProjectAggregate(projectId),
  ),

  'project:listAggregates': createTypedHandler((projectIds: string[]) =>
    loadProjectAggregates(projectIds),
  ),

  'project:refreshAggregate': createTypedHandler((projectId: string) =>
    refreshProjectAggregate(projectId),
  ),

  'project:loadDeepAnalysis': createTypedHandler((projectId: string, sessionId: string) => {
    const project = getProject(projectId);
    if (!project) return null;
    const conversation = loadNormalizedProjectConversation(project, projectId, sessionId);
    if (!conversation) return null;
    const cached = loadDeepAnalysis(sessionId, conversation.provider);
    if (!cached) return null;
    return cached.sourceFingerprint === undefined ||
      cached.sourceFingerprint === conversationFingerprint(conversation)
      ? cached
      : null;
  }),

  'project:deepAnalyzeConversation': createTypedHandler(
    async (projectId: string, sessionId: string) => {
      const project = getProject(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      const conversation = loadNormalizedProjectConversation(project, projectId, sessionId);
      if (!conversation) throw new Error(`Conversation ${sessionId} not found or unreadable.`);
      return runNormalizedDeepAnalysis(conversation);
    },
  ),

  // V1.1 friction classifier — lazy-load helpers around the persisted output
  // of the streaming `classifyConvo:*` runner. The actual classification is
  // started/stopped/streamed via that family; these channels only read what
  // is already on disk and never trigger a model call.
  'project:getConversationDigest': createTypedHandler(
    (projectId: string, sessionId: string) => {
      const project = getProject(projectId);
      if (!project) return null;
      return loadDigest(project.projectPath, sessionId);
    },
  ),

  'project:listConversationDigests': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    return listDigestsForProject(project.projectPath);
  }),

  'project:listSkills': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    return listSkills(project.projectPath, projectId);
  }),

  'project:getSkill': createTypedHandler((projectId: string, skillName: string) => {
    const project = getProject(projectId);
    if (!project) return null;
    return getSkill(project.projectPath, projectId, skillName);
  }),

  'project:saveSkill': createTypedHandler(
    (projectId: string, skillName: string, content: string) => {
      const project = getProject(projectId);
      if (!project) return;
      saveSkill(project.projectPath, skillName, content);
    },
  ),

  'project:readSkillFile': createTypedHandler(
    (projectId: string, skillName: string, relativePath: string) => {
      const project = getProject(projectId);
      if (!project) return null;
      return readSkillFile(project.projectPath, skillName, relativePath);
    },
  ),

  'project:saveSkillFile': createTypedHandler(
    (projectId: string, skillName: string, relativePath: string, content: string) => {
      const project = getProject(projectId);
      if (!project) return;
      saveSkillFile(project.projectPath, skillName, relativePath, content);
    },
  ),

  'project:getRecommendations': createTypedHandler(() => []),
};
