import {
  scan as scanProjects,
  listProjects,
  getProject,
  dismissProject,
  listDismissedProjects,
  undismissProject,
} from '../../services/project-scanner.js';
import { listConversations, getConversationMessages } from '../../services/conversation-parser.js';
import { getOrComputeAnalysis } from '../../services/conversation-analysis-cache.js';
import {
  loadProjectAggregate,
  refreshProjectAggregate,
} from '../../services/project-aggregate-cache.js';
import {
  loadDeepAnalysis,
  runDeepAnalysis,
} from '../../services/conversation-deep-analyzer.js';
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
    scanProjects((current, total, projectName) => {
      eventBus.broadcast('project:scanProgress', {
        provider: 'claude',
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

  'project:listConversations': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    return listConversations(project.providerProjectDir, projectId);
  }),

  'project:getConversationMessages': createTypedHandler((projectId: string, sessionId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    return getConversationMessages(project.providerProjectDir, sessionId);
  }),

  'project:analyzeConversation': createTypedHandler((projectId: string, sessionId: string) => {
    const project = getProject(projectId);
    if (!project) return null;
    return getOrComputeAnalysis(project.providerProjectDir, sessionId, projectId);
  }),

  'project:listConversationsWithAnalysis': createTypedHandler((projectId: string) => {
    const project = getProject(projectId);
    if (!project) return [];
    const convs = listConversations(project.providerProjectDir, projectId);
    return convs
      .map((c) => getOrComputeAnalysis(project.providerProjectDir, c.sessionId, projectId))
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }),

  'project:getAggregate': createTypedHandler((projectId: string) =>
    loadProjectAggregate(projectId),
  ),

  'project:refreshAggregate': createTypedHandler((projectId: string) =>
    refreshProjectAggregate(projectId),
  ),

  'project:loadDeepAnalysis': createTypedHandler((_projectId: string, sessionId: string) =>
    loadDeepAnalysis(sessionId),
  ),

  'project:deepAnalyzeConversation': createTypedHandler(
    async (projectId: string, sessionId: string) => {
      const project = getProject(projectId);
      if (!project) throw new Error(`Project ${projectId} not found`);
      return runDeepAnalysis(project.providerProjectDir, sessionId, projectId);
    },
  ),

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
