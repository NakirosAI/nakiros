export const IPC_CHANNELS = {
  // Generic
  'shell:openPath': 'shell:openPath',

  // Meta
  'meta:getVersionInfo': 'meta:getVersionInfo',

  // Preferences
  'preferences:get': 'preferences:get',
  'preferences:getSystemLanguage': 'preferences:getSystemLanguage',
  'preferences:save': 'preferences:save',

  // Onboarding
  'onboarding:detectEditors': 'onboarding:detectEditors',
  'onboarding:install': 'onboarding:install',
  'onboarding:nakirosConfigExists': 'onboarding:nakirosConfigExists',
  'onboarding:progress': 'onboarding:progress',

  // Agent installer (skill commands installation)
  'agents:cli-status': 'agents:cli-status',
  'agents:global-status': 'agents:global-status',
  'agents:installed-commands': 'agents:installed-commands',
  'agents:install': 'agents:install',
  'agents:install-global': 'agents:install-global',
  'agents:status': 'agents:status',

  // Nakiros Agent Team — Project management
  'project:scan': 'project:scan',
  'project:scanProgress': 'project:scanProgress',
  'project:dismiss': 'project:dismiss',
  'project:list': 'project:list',
  'project:get': 'project:get',
  'project:getStats': 'project:getStats',
  'project:getGlobalStats': 'project:getGlobalStats',
  'project:listConversations': 'project:listConversations',
  'project:getConversation': 'project:getConversation',
  'project:getConversationMessages': 'project:getConversationMessages',
  'project:listSkills': 'project:listSkills',
  'project:getSkill': 'project:getSkill',
  'project:saveSkill': 'project:saveSkill',
  'project:readSkillFile': 'project:readSkillFile',
  'project:saveSkillFile': 'project:saveSkillFile',
  'project:getRecommendations': 'project:getRecommendations',

  // Nakiros bundled skills
  'nakiros:listBundledSkills': 'nakiros:listBundledSkills',
  'nakiros:getBundledSkill': 'nakiros:getBundledSkill',
  'nakiros:readBundledSkillFile': 'nakiros:readBundledSkillFile',
  'nakiros:saveBundledSkillFile': 'nakiros:saveBundledSkillFile',
  'nakiros:promoteBundledSkill': 'nakiros:promoteBundledSkill',
  'nakiros:listBundledSkillConflicts': 'nakiros:listBundledSkillConflicts',
  'nakiros:resolveBundledSkillConflict': 'nakiros:resolveBundledSkillConflict',
  'nakiros:readBundledSkillConflictDiff': 'nakiros:readBundledSkillConflictDiff',

  // Unified binary/asset file reader (works across project/nakiros-bundled/claude-global scopes)
  'skill:readFileAsDataUrl': 'skill:readFileAsDataUrl',

  // User-global skills (~/.claude/skills/, excluding our symlinks)
  'claudeGlobal:listSkills': 'claudeGlobal:listSkills',
  'claudeGlobal:getSkill': 'claudeGlobal:getSkill',
  'claudeGlobal:readSkillFile': 'claudeGlobal:readSkillFile',
  'claudeGlobal:saveSkillFile': 'claudeGlobal:saveSkillFile',

  // Plugin skills (~/.claude/plugins/<plugin>/skills/, plus project-local plugins)
  'pluginSkills:list': 'pluginSkills:list',
  'pluginSkills:getSkill': 'pluginSkills:getSkill',
  'pluginSkills:readSkillFile': 'pluginSkills:readSkillFile',
  'pluginSkills:saveSkillFile': 'pluginSkills:saveSkillFile',

  // Eval runner
  'eval:startRuns': 'eval:startRuns',
  'eval:stopRun': 'eval:stopRun',
  'eval:listRuns': 'eval:listRuns',
  'eval:loadPersisted': 'eval:loadPersisted',
  'eval:event': 'eval:event',
  'eval:sendUserMessage': 'eval:sendUserMessage',
  'eval:finishRun': 'eval:finishRun',
  'eval:getBufferedEvents': 'eval:getBufferedEvents',
  'eval:getFeedback': 'eval:getFeedback',
  'eval:saveFeedback': 'eval:saveFeedback',
  'eval:listOutputs': 'eval:listOutputs',
  'eval:readOutput': 'eval:readOutput',
  'eval:readDiffPatch': 'eval:readDiffPatch',
  'eval:getMatrix': 'eval:getMatrix',
  'eval:loadIterationRun': 'eval:loadIterationRun',

  // Audit runner
  'audit:start': 'audit:start',
  'audit:stopRun': 'audit:stopRun',
  'audit:getRun': 'audit:getRun',
  'audit:sendUserMessage': 'audit:sendUserMessage',
  'audit:finish': 'audit:finish',
  'audit:listHistory': 'audit:listHistory',
  'audit:readReport': 'audit:readReport',
  'audit:event': 'audit:event',
  'audit:listActive': 'audit:listActive',
  'audit:getBufferedEvents': 'audit:getBufferedEvents',

  // Fix runner
  'fix:start': 'fix:start',
  'fix:stopRun': 'fix:stopRun',
  'fix:getRun': 'fix:getRun',
  'fix:sendUserMessage': 'fix:sendUserMessage',
  'fix:finish': 'fix:finish',
  'fix:event': 'fix:event',
  'fix:runEvalsInTemp': 'fix:runEvalsInTemp',
  'fix:getBenchmarks': 'fix:getBenchmarks',
  'fix:listActive': 'fix:listActive',
  'fix:getBufferedEvents': 'fix:getBufferedEvents',
  'fix:listDiff': 'fix:listDiff',
  'fix:readDiffFile': 'fix:readDiffFile',

  // Create runner — thin mirror of fix:* with different temp-workdir seeding and sync-back policy.
  'create:start': 'create:start',
  'create:stopRun': 'create:stopRun',
  'create:getRun': 'create:getRun',
  'create:sendUserMessage': 'create:sendUserMessage',
  'create:finish': 'create:finish',
  'create:event': 'create:event',
  'create:listActive': 'create:listActive',
  'create:getBufferedEvents': 'create:getBufferedEvents',
  'create:listDiff': 'create:listDiff',
  'create:readDiffFile': 'create:readDiffFile',

  // Draft files (shared by fix + create — reads from the run's temp workdir)
  'skillAgent:listTempFiles': 'skillAgent:listTempFiles',
  'skillAgent:readTempFile': 'skillAgent:readTempFile',
} as const;

export type IpcChannel = keyof typeof IPC_CHANNELS;
