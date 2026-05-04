/**
 * Canonical IPC channel registry shared between the daemon, the HTTP client
 * used by the frontend, and `global.d.ts`. Every handler, client call, and
 * type declaration MUST reference names from this map — no hardcoded channel
 * strings elsewhere. Enforced by `CLAUDE.md`.
 *
 * Each key equals its value so the object acts as a string enum while giving
 * the compiler stable literal-type inference.
 */
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
  'project:analyzeConversation': 'project:analyzeConversation',
  'project:listConversationsWithAnalysis': 'project:listConversationsWithAnalysis',
  'project:deepAnalyzeConversation': 'project:deepAnalyzeConversation',
  'project:loadDeepAnalysis': 'project:loadDeepAnalysis',
  // Lazy-load helpers for classify-convo digests. The runner family lives
  // under `classifyConvo:*` — these read the persisted output without
  // re-running the model.
  'project:getConversationDigest': 'project:getConversationDigest',
  'project:listConversationDigests': 'project:listConversationDigests',
  'project:listSkills': 'project:listSkills',
  'project:getSkill': 'project:getSkill',
  'project:saveSkill': 'project:saveSkill',
  'project:readSkillFile': 'project:readSkillFile',
  'project:saveSkillFile': 'project:saveSkillFile',
  'project:getRecommendations': 'project:getRecommendations',
  'project:getAggregate': 'project:getAggregate',
  'project:refreshAggregate': 'project:refreshAggregate',
  'project:aggregateUpdated': 'project:aggregateUpdated',
  'project:listDismissed': 'project:listDismissed',
  'project:undismiss': 'project:undismiss',

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
  'eval:listBaselines': 'eval:listBaselines',
  'eval:getTimeline': 'eval:getTimeline',
  'eval:getIterationUsage': 'eval:getIterationUsage',
  'eval:getBatchUsage': 'eval:getBatchUsage',

  // Eval model comparison (A/B/C across Haiku/Sonnet/Opus)
  'comparison:run': 'comparison:run',
  'comparison:list': 'comparison:list',
  'comparison:getMatrix': 'comparison:getMatrix',
  'comparison:getFingerprintStatus': 'comparison:getFingerprintStatus',

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
  'audit:listAll': 'audit:listAll',
  'audit:getBufferedEvents': 'audit:getBufferedEvents',
  'audit:getTimeline': 'audit:getTimeline',
  'audit:getUsage': 'audit:getUsage',

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
  'fix:listAll': 'fix:listAll',
  'fix:getBufferedEvents': 'fix:getBufferedEvents',
  'fix:listDiff': 'fix:listDiff',
  'fix:readDiffFile': 'fix:readDiffFile',
  'fix:getEditsHistory': 'fix:getEditsHistory',
  'fix:getTimeline': 'fix:getTimeline',
  'fix:getFixTempMatrix': 'fix:getFixTempMatrix',
  'fix:getUsage': 'fix:getUsage',

  // Create runner — thin mirror of fix:* with different temp-workdir seeding and sync-back policy.
  'create:start': 'create:start',
  'create:stopRun': 'create:stopRun',
  'create:getRun': 'create:getRun',
  'create:sendUserMessage': 'create:sendUserMessage',
  'create:finish': 'create:finish',
  'create:event': 'create:event',
  'create:listActive': 'create:listActive',
  'create:listAll': 'create:listAll',
  'create:getBufferedEvents': 'create:getBufferedEvents',
  'create:listDiff': 'create:listDiff',
  'create:readDiffFile': 'create:readDiffFile',
  'create:getTimeline': 'create:getTimeline',
  'create:getUsage': 'create:getUsage',
  'create:runEvals': 'create:runEvals',

  // Draft files (shared by fix + create — reads from the run's temp workdir)
  'skillAgent:listTempFiles': 'skillAgent:listTempFiles',
  'skillAgent:readTempFile': 'skillAgent:readTempFile',


  // .claude/ configuration explorer (read-only V1)
  'claudeConfig:scan': 'claudeConfig:scan',
  'claudeConfig:readFile': 'claudeConfig:readFile',

  // .claude/rules/ editor (Module 1 V2)
  'claudeRules:list': 'claudeRules:list',
  'claudeRules:read': 'claudeRules:read',
  'claudeRules:create': 'claudeRules:create',
  'claudeRules:save': 'claudeRules:save',
  'claudeRules:delete': 'claudeRules:delete',
  'claudeRules:suggestPaths': 'claudeRules:suggestPaths',

  // .claude/agents/ editor (Module 2 V2)
  'claudeAgents:list': 'claudeAgents:list',
  'claudeAgents:read': 'claudeAgents:read',
  'claudeAgents:create': 'claudeAgents:create',
  'claudeAgents:save': 'claudeAgents:save',
  'claudeAgents:delete': 'claudeAgents:delete',

  // .claude/output-styles/ editor (Module 3 V2)
  'claudeOutputStyles:list': 'claudeOutputStyles:list',
  'claudeOutputStyles:read': 'claudeOutputStyles:read',
  'claudeOutputStyles:create': 'claudeOutputStyles:create',
  'claudeOutputStyles:save': 'claudeOutputStyles:save',
  'claudeOutputStyles:delete': 'claudeOutputStyles:delete',

  // .claude/settings.json (+ .local) permissions editor (Module 4 V2)
  'claudePermissions:read': 'claudePermissions:read',
  'claudePermissions:save': 'claudePermissions:save',

  // .mcp.json editor (Module 5 V2)
  'claudeMcp:list': 'claudeMcp:list',
  'claudeMcp:read': 'claudeMcp:read',
  'claudeMcp:create': 'claudeMcp:create',
  'claudeMcp:save': 'claudeMcp:save',
  'claudeMcp:delete': 'claudeMcp:delete',

  // .claude/settings.json hooks editor (Module 6 V2)
  'claudeHooks:read': 'claudeHooks:read',
  'claudeHooks:save': 'claudeHooks:save',

  // CLAUDE.md editor (Module 7 V2)
  'claudeMd:list': 'claudeMd:list',
  'claudeMd:read': 'claudeMd:read',
  'claudeMd:save': 'claudeMd:save',
  'claudeMd:delete': 'claudeMd:delete',
  // CLAUDE.md audit history (archived from audit-runner when claudemdTarget present)
  'claudeMd:listAudits': 'claudeMd:listAudits',
  'claudeMd:readAudit': 'claudeMd:readAudit',

  // Rules CRUD — project-scoped, recursive discovery under .claude/rules/
  'rules:list': 'rules:list',
  'rules:read': 'rules:read',
  'rules:save': 'rules:save',
  'rules:delete': 'rules:delete',
  // Rules audit history (archived from audit-runner when rulesTarget present)
  'rules:listAudits': 'rules:listAudits',
  'rules:readAudit': 'rules:readAudit',

  // Subagents CRUD — project-scoped, recursive discovery under .claude/agents/
  'subagents:list': 'subagents:list',
  'subagents:read': 'subagents:read',
  'subagents:save': 'subagents:save',
  'subagents:delete': 'subagents:delete',
  // Subagents audit history (archived from audit-runner when subagentsTarget present)
  'subagents:listAudits': 'subagents:listAudits',
  'subagents:readAudit': 'subagents:readAudit',

  // Hooks expert — singleton read/save (hooks block only) + audit history.
  // NOTE: 'hooks:*' is distinct from the editor channels 'claudeHooks:*'
  // (Module 6 V2) which edit the full hooks structure per scope. These four
  // channels are for the `nakiros-hooks-expert` audit/fix/create flow.
  'hooks:read': 'hooks:read',
  'hooks:save': 'hooks:save',
  'hooks:listAudits': 'hooks:listAudits',
  'hooks:readAudit': 'hooks:readAudit',

  // Conversation ingest (Phase A V1 — opt-in Stop-hook pipeline)
  'conversationIngest:status': 'conversationIngest:status',
  'conversationIngest:previewHookDiff': 'conversationIngest:previewHookDiff',
  'conversationIngest:enable': 'conversationIngest:enable',
  'conversationIngest:disable': 'conversationIngest:disable',
  'conversationIngest:purge': 'conversationIngest:purge',
  'conversationIngest:runNow': 'conversationIngest:runNow',
  'conversationIngest:listProjects': 'conversationIngest:listProjects',
  'conversationIngest:listSessions': 'conversationIngest:listSessions',
  'conversationIngest:progress': 'conversationIngest:progress',

  // Conversation deep-analysis runner (analyze-convo Run kind)
  'analyzeConvo:start': 'analyzeConvo:start',
  'analyzeConvo:stopRun': 'analyzeConvo:stopRun',
  'analyzeConvo:getRun': 'analyzeConvo:getRun',
  'analyzeConvo:sendUserMessage': 'analyzeConvo:sendUserMessage',
  'analyzeConvo:finish': 'analyzeConvo:finish',
  'analyzeConvo:event': 'analyzeConvo:event',
  'analyzeConvo:listActive': 'analyzeConvo:listActive',
  'analyzeConvo:listAll': 'analyzeConvo:listAll',
  'analyzeConvo:getBufferedEvents': 'analyzeConvo:getBufferedEvents',

  // Conversation friction-classifier runner (classify-convo Run kind, V1.1)
  'classifyConvo:start': 'classifyConvo:start',
  'classifyConvo:stopRun': 'classifyConvo:stopRun',
  'classifyConvo:getRun': 'classifyConvo:getRun',
  'classifyConvo:sendUserMessage': 'classifyConvo:sendUserMessage',
  'classifyConvo:finish': 'classifyConvo:finish',
  'classifyConvo:event': 'classifyConvo:event',
  'classifyConvo:listActive': 'classifyConvo:listActive',
  'classifyConvo:listAll': 'classifyConvo:listAll',
  'classifyConvo:getBufferedEvents': 'classifyConvo:getBufferedEvents',
} as const;

/** Union of every IPC channel key declared in {@link IPC_CHANNELS}. */
export type IpcChannel = keyof typeof IPC_CHANNELS;
