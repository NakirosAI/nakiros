import type { NormalizedConversation, Project } from '@nakiros/shared';

import { getCachedCodexAnalysis } from './codex-conversation-analysis-cache.js';
import { getCodexConversationMessages } from './codex-conversation-parser.js';
import { getOrComputeAnalysis } from './conversation-analysis-cache.js';
import { getSessionTranscriptDir } from './conversation-ingest/index.js';
import { getConversationMessages } from './conversation-parser.js';
import { normalizeProviderConversation } from './provider-conversation.js';

export function codexSessionsDir(project: Project): string | null {
  return project.agents?.find(
    (installation) => installation.provider === 'codex' && installation.surface === 'cli',
  )?.providerProjectDir ?? (project.provider === 'codex' ? project.providerProjectDir : null);
}

/** Resolve either provider into the single conversation contract used by Argos. */
export function loadNormalizedProjectConversation(
  project: Project,
  projectId: string,
  sessionId: string,
): NormalizedConversation | null {
  const sessionsDir = codexSessionsDir(project);
  if (sessionsDir) {
    const analysis = getCachedCodexAnalysis(
      sessionsDir, project.projectPath, projectId, sessionId,
    );
    const messages = getCodexConversationMessages(
      sessionsDir, project.projectPath, projectId, sessionId,
    );
    if (analysis && messages) return normalizeProviderConversation(analysis, messages);
  }

  const analysisDir =
    getSessionTranscriptDir(project.projectPath, sessionId) ?? project.providerProjectDir;
  const analysis = getOrComputeAnalysis(analysisDir, sessionId, projectId);
  if (!analysis) return null;
  return normalizeProviderConversation(analysis, getConversationMessages(analysisDir, sessionId));
}
