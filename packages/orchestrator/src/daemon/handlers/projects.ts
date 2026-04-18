import {
  scan as scanProjects,
  listProjects,
  getProject,
  dismissProject,
} from '../../services/project-scanner.js';
import { listConversations, getConversationMessages } from '../../services/conversation-parser.js';
import {
  listSkills,
  getSkill,
  saveSkill,
  readSkillFile,
  saveSkillFile,
} from '../../services/skill-reader.js';
import { eventBus } from '../event-bus.js';
import type { HandlerRegistry } from './index.js';

export const projectHandlers: HandlerRegistry = {
  'project:scan': () =>
    scanProjects((current, total, projectName) => {
      eventBus.broadcast('project:scanProgress', {
        provider: 'claude',
        current,
        total,
        projectName,
      });
    }),
  'project:list': () => listProjects(),
  'project:get': (args) => getProject(args[0] as string),
  'project:dismiss': (args) => {
    dismissProject(args[0] as string);
  },
  'project:getStats': () => null,
  'project:getGlobalStats': () => null,

  'project:listConversations': (args) => {
    const projectId = args[0] as string;
    const project = getProject(projectId);
    if (!project) return [];
    return listConversations(project.providerProjectDir, projectId);
  },

  'project:getConversationMessages': (args) => {
    const projectId = args[0] as string;
    const sessionId = args[1] as string;
    const project = getProject(projectId);
    if (!project) return [];
    return getConversationMessages(project.providerProjectDir, sessionId);
  },

  'project:listSkills': (args) => {
    const projectId = args[0] as string;
    const project = getProject(projectId);
    if (!project) return [];
    return listSkills(project.projectPath, projectId);
  },

  'project:getSkill': (args) => {
    const projectId = args[0] as string;
    const skillName = args[1] as string;
    const project = getProject(projectId);
    if (!project) return null;
    return getSkill(project.projectPath, projectId, skillName);
  },

  'project:saveSkill': (args) => {
    const projectId = args[0] as string;
    const skillName = args[1] as string;
    const content = args[2] as string;
    const project = getProject(projectId);
    if (!project) return;
    saveSkill(project.projectPath, skillName, content);
  },

  'project:readSkillFile': (args) => {
    const projectId = args[0] as string;
    const skillName = args[1] as string;
    const relativePath = args[2] as string;
    const project = getProject(projectId);
    if (!project) return null;
    return readSkillFile(project.projectPath, skillName, relativePath);
  },

  'project:saveSkillFile': (args) => {
    const projectId = args[0] as string;
    const skillName = args[1] as string;
    const relativePath = args[2] as string;
    const content = args[3] as string;
    const project = getProject(projectId);
    if (!project) return;
    saveSkillFile(project.projectPath, skillName, relativePath, content);
  },

  'project:getRecommendations': () => [],
};
