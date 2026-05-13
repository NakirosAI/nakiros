import type {
  SubagentsListResult,
  SubagentsReadResult,
  SubagentsMutationResult,
  SubagentsAuditHistoryEntry,
  HooksReadResult,
  HooksExpertMutationResult,
  HooksAuditHistoryEntry,
  PermissionsReadResult,
  PermissionsExpertMutationResult,
  PermissionsAuditHistoryEntry,
  PermissionsExpertScope,
  McpReadResult,
  McpExpertMutationResult,
  McpAuditHistoryEntry,
  OutputStyleSummary,
  OutputStylesExpertListResult,
  OutputStylesReadResult,
  OutputStylesExpertMutationResult,
  OutputStylesAuditHistoryEntry,
  AppPreferences,
  AgentInstallStatus,
  AgentInstallRequest,
  AgentInstallSummary,
  AgentRunNotificationPayload,
  BundledSkillConflict,
  BundledSkillConflictFileDiff,
  BundledSkillConflictResolution,
  DetectedEditor,
  InstalledCommand,
  OnboardingInstallResult,
  OnboardingProgressEvent,
  OpenAgentRunChatPayload,
  SkillDiffEntry,
  SkillDiffFilePayload,
  VersionInfo,
  GetChangelogResult,
  ResolvedLanguage,
  Project,
  ProjectAggregate,
  ProjectConversation,
  ConversationMessage,
  ConversationAnalysis,
  ConversationDeepAnalysis,
  ConversationDigest,
  ConversationDigestSummary,
  ClassifyConvoRun,
  ClassifyConvoRunEvent,
  StartClassifyConvoRequest,
  Skill,
  SkillScope,
  ScanProgress,
  StartEvalRunRequest,
  StartEvalRunResponse,
  SkillEvalRun,
  EvalRunEvent,
  EvalRunOutputEntry,
  ChatTimelineEntry,
  StartAuditRequest,
  AuditRun,
  AuditRunEvent,
  AuditHistoryEntry,
  AuditTimelineEntry,
  AnalyzeConvoRun,
  AnalyzeConvoRunEvent,
  FixBenchmarks,
  FixEdit,
  FixTimelineEntry,
  FixUsage,
  SkillAgentTempFileEntry,
  SkillAgentTempFileContent,
  EvalMatrix,
  GetEvalMatrixRequest,
  IterationRunArtifact,
  ListBaselinesRequest,
  ListBaselinesResponse,
  LoadIterationRunRequest,
  ComparisonFingerprintStatus,
  ComparisonMatrix,
  ComparisonSummary,
  GetComparisonFingerprintStatusRequest,
  GetComparisonMatrixRequest,
  ListComparisonsRequest,
  RunComparisonRequest,
  RunComparisonResponse,
  ClaudeConfigSnapshot,
  CreateRuleRequest,
  RuleEntry,
  RuleFileContent,
  RuleMutationResult,
  SaveRuleRequest,
  AgentEntry,
  AgentFileContent,
  AgentMutationResult,
  CreateAgentRequest,
  SaveAgentRequest,
  CreateOutputStyleRequest,
  OutputStyleFileContent,
  OutputStyleMutationResult,
  OutputStylesListResult,
  SaveOutputStyleRequest,
  PermissionsFileContent,
  PermissionsMutationResult,
  PermissionsScope,
  SavePermissionsRequest,
  CreateMcpServerRequest,
  McpInfo,
  McpMutationResult,
  McpServerForEditor,
  SaveMcpServerRequest,
  HooksFileContent,
  HooksMutationResult,
  SaveHooksRequest,
  ClaudeMdFileContent,
  ClaudeMdListResult,
  ClaudeMdMutationResult,
  ClaudeMdAuditHistoryEntry,
  SaveClaudeMdRequest,
  RulesListResult,
  RulesReadResult,
  RulesMutationResult,
  RulesAuditHistoryEntry,
  ConversationIngestStatus,
  ConversationIngestHookDiff,
  ConversationIngestMutationResult,
  ConversationIngestProject,
  ConversationIngestSession,
  ConversationIngestProgressEvent,
  ApplyRecoResponse,
  RecoCard,
  RecommendationAnalyzeRun,
  RecommendationAnalyzeRunEvent,
  RecommendationPattern,
  StartRecommendationAnalyzeRequest,
} from '@nakiros/shared';

declare global {
  interface Window {
    nakiros: {
      // Generic shell / clipboard
      openPath(path: string): Promise<void>;
      writeClipboard(text: string): Promise<void>;

      // Meta
      getVersionInfo(options?: { force?: boolean }): Promise<VersionInfo>;
      /** Returns the raw CHANGELOG.md content and the running version. */
      getChangelog(): Promise<GetChangelogResult>;

      // Preferences
      getPreferences(): Promise<AppPreferences>;
      getSystemLanguage(): Promise<ResolvedLanguage>;
      savePreferences(prefs: AppPreferences): Promise<void>;

      // Agent installer (skill commands installation)
      getAgentInstallStatus(repoPath: string): Promise<AgentInstallStatus>;
      installAgents(request: AgentInstallRequest): Promise<AgentInstallSummary>;
      getAgentCliStatus(): Promise<Array<{
        provider: 'claude' | 'codex' | 'cursor';
        label: string;
        command: string;
        installed: boolean;
        path?: string;
        version?: string;
        error?: string;
      }>>;
      getGlobalInstallStatus(): Promise<{
        environments: Array<{
          id: 'claude' | 'codex' | 'cursor';
          label: string;
          targetDir: string;
          installed: number;
          total: number;
        }>;
        totalInstalled: number;
        totalExpected: number;
      }>;
      getInstalledCommands(): Promise<InstalledCommand[]>;
      installAgentsGlobal(): Promise<{
        environments: Array<{
          id: 'claude' | 'codex' | 'cursor';
          label: string;
          targetDir: string;
          commandFilesCopied: number;
          commandFilesOverwritten: number;
        }>;
        commandFilesCopied: number;
        commandFilesOverwritten: number;
      }>;

      // Notifications
      showAgentRunNotification(payload: AgentRunNotificationPayload): Promise<void>;
      onOpenAgentRunChat(cb: (payload: OpenAgentRunChatPayload) => void): () => void;

      // Onboarding
      nakirosConfigExists(): Promise<boolean>;
      onboardingDetectEditors(): Promise<DetectedEditor[]>;
      onboardingInstall(editors: DetectedEditor[]): Promise<OnboardingInstallResult>;
      onOnboardingProgress(cb: (event: OnboardingProgressEvent) => void): () => void;

      // ─── Nakiros Agent Team — Projects ─────────────────────────────────────
      scanProjects(): Promise<Project[]>;
      listProjects(): Promise<Project[]>;
      getProject(id: string): Promise<Project | null>;
      dismissProject(id: string): Promise<void>;
      listDismissedProjects(): Promise<Project[]>;
      undismissProject(id: string): Promise<Project | null>;

      listProjectConversations(projectId: string): Promise<ProjectConversation[]>;
      getProjectConversationMessages(projectId: string, sessionId: string): Promise<ConversationMessage[]>;
      analyzeProjectConversation(projectId: string, sessionId: string): Promise<ConversationAnalysis | null>;
      listProjectConversationsWithAnalysis(projectId: string): Promise<ConversationAnalysis[]>;
      getProjectAggregate(projectId: string): Promise<ProjectAggregate | null>;
      refreshProjectAggregate(projectId: string): Promise<ProjectAggregate | null>;
      onProjectAggregateUpdated(cb: (aggregate: ProjectAggregate) => void): () => void;
      loadConversationDeepAnalysis(projectId: string, sessionId: string): Promise<ConversationDeepAnalysis | null>;
      /** @deprecated kept for backward compat — prefer the streaming analyzeConvo:* family. */
      deepAnalyzeConversation(projectId: string, sessionId: string): Promise<ConversationDeepAnalysis>;

      // V1.1 friction classifier — lazy-load helpers around the persisted
      // output of the streaming `classifyConvo:*` runner. They never trigger
      // a model call.
      getConversationDigest(projectId: string, sessionId: string): Promise<ConversationDigest | null>;
      listConversationDigests(projectId: string): Promise<ConversationDigestSummary[]>;

      // Conversation friction-classifier runner (classify-convo Run kind, V1.1)
      startClassifyConvo(request: StartClassifyConvoRequest): Promise<ClassifyConvoRun>;
      stopClassifyConvo(runId: string): Promise<void>;
      getClassifyConvoRun(runId: string): Promise<ClassifyConvoRun | null>;
      sendClassifyConvoUserMessage(runId: string, message: string): Promise<void>;
      finishClassifyConvo(runId: string): Promise<void>;
      listActiveClassifyConvoRuns(): Promise<ClassifyConvoRun[]>;
      listAllClassifyConvoRuns(): Promise<ClassifyConvoRun[]>;
      getClassifyConvoBufferedEvents(runId: string): Promise<ClassifyConvoRunEvent['event'][]>;
      onClassifyConvoEvent(cb: (event: ClassifyConvoRunEvent) => void): () => void;

      // Conversation deep-analysis runner (analyze-convo Run kind)
      startAnalyzeConvo(request: { projectId: string; sessionId: string }): Promise<AnalyzeConvoRun>;
      stopAnalyzeConvo(runId: string): Promise<void>;
      getAnalyzeConvoRun(runId: string): Promise<AnalyzeConvoRun | null>;
      sendAnalyzeConvoUserMessage(runId: string, message: string): Promise<void>;
      finishAnalyzeConvo(runId: string): Promise<void>;
      listActiveAnalyzeConvoRuns(): Promise<AnalyzeConvoRun[]>;
      listAllAnalyzeConvoRuns(): Promise<AnalyzeConvoRun[]>;
      getAnalyzeConvoBufferedEvents(runId: string): Promise<AnalyzeConvoRunEvent['event'][]>;
      onAnalyzeConvoEvent(cb: (event: AnalyzeConvoRunEvent) => void): () => void;

      listProjectSkills(projectId: string): Promise<Skill[]>;
      getProjectSkill(projectId: string, skillName: string): Promise<Skill | null>;
      saveProjectSkill(projectId: string, skillName: string, content: string): Promise<void>;
      readSkillFile(projectId: string, skillName: string, relativePath: string): Promise<string | null>;
      saveSkillFile(projectId: string, skillName: string, relativePath: string, content: string): Promise<void>;

      // Nakiros bundled skills
      listBundledSkills(): Promise<Skill[]>;
      getBundledSkill(skillName: string): Promise<Skill | null>;
      readBundledSkillFile(skillName: string, relativePath: string): Promise<string | null>;
      saveBundledSkillFile(skillName: string, relativePath: string, content: string): Promise<void>;
      promoteBundledSkill(skillName: string): Promise<string>;
      listBundledSkillConflicts(): Promise<BundledSkillConflict[]>;
      resolveBundledSkillConflict(
        skillName: string,
        resolution: BundledSkillConflictResolution,
      ): Promise<void>;
      readBundledSkillConflictDiff(
        skillName: string,
        relativePath: string,
      ): Promise<BundledSkillConflictFileDiff>;

      // User-global skills (~/.claude/skills/, excluding our symlinks)
      listClaudeGlobalSkills(): Promise<Skill[]>;
      getClaudeGlobalSkill(skillName: string): Promise<Skill | null>;
      readClaudeGlobalSkillFile(skillName: string, relativePath: string): Promise<string | null>;
      saveClaudeGlobalSkillFile(skillName: string, relativePath: string, content: string): Promise<void>;

      // Plugin skills (~/.claude/plugins/marketplaces/<mkt>/plugins/<plugin>/skills/)
      listPluginSkills(): Promise<Skill[]>;
      getPluginSkill(marketplaceName: string, pluginName: string, skillName: string): Promise<Skill | null>;
      readPluginSkillFile(marketplaceName: string, pluginName: string, skillName: string, relativePath: string): Promise<string | null>;
      savePluginSkillFile(marketplaceName: string, pluginName: string, skillName: string, relativePath: string, content: string): Promise<void>;
      readSkillFileAsDataUrl(request: { scope: SkillScope; marketplaceName?: string; pluginName?: string; projectId?: string; skillName: string; relativePath: string }): Promise<string | null>;

      // Eval runner
      startEvalRuns(request: StartEvalRunRequest): Promise<StartEvalRunResponse>;
      stopEvalRun(runId: string): Promise<void>;
      listEvalRuns(): Promise<SkillEvalRun[]>;
      loadPersistedEvalRuns(request: { scope: SkillScope; marketplaceName?: string; pluginName?: string; projectId?: string; skillName: string }): Promise<SkillEvalRun[]>;
      onEvalEvent(cb: (event: EvalRunEvent) => void): () => void;
      sendEvalUserMessage(runId: string, message: string): Promise<void>;
      finishEvalRun(runId: string): Promise<void>;
      getEvalBufferedEvents(runId: string): Promise<EvalRunEvent['event'][]>;
      getEvalFeedback(request: { scope: SkillScope; marketplaceName?: string; pluginName?: string; projectId?: string; skillName: string; iteration: number }): Promise<Record<string, string>>;
      saveEvalFeedback(request: { scope: SkillScope; marketplaceName?: string; pluginName?: string; projectId?: string; skillName: string; iteration: number; evalName: string; feedback: string }): Promise<void>;
      listEvalRunOutputs(runId: string): Promise<EvalRunOutputEntry[]>;
      readEvalRunOutput(runId: string, relativePath: string): Promise<string | null>;
      readEvalRunDiffPatch(runId: string): Promise<string | null>;
      getEvalMatrix(request: GetEvalMatrixRequest): Promise<EvalMatrix>;
      loadIterationRun(request: LoadIterationRunRequest): Promise<IterationRunArtifact>;
      listEvalBaselines(request: ListBaselinesRequest): Promise<ListBaselinesResponse>;
      getEvalTimeline(runId: string): Promise<ChatTimelineEntry[]>;
      getEvalIterationUsage(runId: string): Promise<FixUsage>;
      getEvalBatchUsage(runIds: string[]): Promise<FixUsage>;
      runModelComparison(request: RunComparisonRequest): Promise<RunComparisonResponse>;
      listModelComparisons(request: ListComparisonsRequest): Promise<ComparisonSummary[]>;
      getModelComparison(request: GetComparisonMatrixRequest): Promise<ComparisonMatrix | null>;
      getComparisonFingerprintStatus(
        request: GetComparisonFingerprintStatusRequest,
      ): Promise<ComparisonFingerprintStatus>;

      // Audit
      startAudit(request: StartAuditRequest): Promise<AuditRun>;
      stopAudit(runId: string): Promise<void>;
      getAuditRun(runId: string): Promise<AuditRun | null>;
      sendAuditUserMessage(runId: string, message: string): Promise<void>;
      finishAudit(runId: string): Promise<void>;
      listAuditHistory(request: { scope: SkillScope; marketplaceName?: string; pluginName?: string; projectId?: string; skillName: string }): Promise<AuditHistoryEntry[]>;
      readAuditReport(path: string): Promise<string | null>;
      listActiveAuditRuns(): Promise<AuditRun[]>;
      listAllAuditRuns(): Promise<AuditRun[]>;
      getAuditBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      getAuditTimeline(runId: string): Promise<AuditTimelineEntry[]>;
      getAuditUsage(runId: string): Promise<FixUsage>;
      onAuditEvent(cb: (event: AuditRunEvent) => void): () => void;

      // Fix
      startFix(request: StartAuditRequest): Promise<AuditRun>;
      stopFix(runId: string): Promise<void>;
      getFixRun(runId: string): Promise<AuditRun | null>;
      sendFixUserMessage(runId: string, message: string): Promise<void>;
      finishFix(runId: string): Promise<void>;
      runFixEvalsInTemp(request: { runId: string; evalNames?: string[]; includeBaseline?: boolean }): Promise<StartEvalRunResponse>;
      getFixBenchmarks(runId: string): Promise<FixBenchmarks>;
      listActiveFixRuns(): Promise<AuditRun[]>;
      listAllFixRuns(): Promise<AuditRun[]>;
      getFixBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      onFixEvent(cb: (event: AuditRunEvent) => void): () => void;
      listFixDiff(runId: string, opts?: { includeUnchanged?: boolean }): Promise<SkillDiffEntry[]>;
      getFixEditsHistory(runId: string): Promise<FixEdit[]>;
      getFixTimeline(runId: string): Promise<FixTimelineEntry[]>;
      getFixTempMatrix(runId: string): Promise<EvalMatrix>;
      getFixUsage(runId: string): Promise<FixUsage>;
      readFixDiffFile(runId: string, relativePath: string): Promise<SkillDiffFilePayload>;

      // Create (skill-factory "create" command)
      startCreate(request: StartAuditRequest): Promise<AuditRun>;
      stopCreate(runId: string): Promise<void>;
      getCreateRun(runId: string): Promise<AuditRun | null>;
      sendCreateUserMessage(runId: string, message: string): Promise<void>;
      finishCreate(runId: string): Promise<void>;
      listActiveCreateRuns(): Promise<AuditRun[]>;
      listAllCreateRuns(): Promise<AuditRun[]>;
      getCreateBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      onCreateEvent(cb: (event: AuditRunEvent) => void): () => void;
      listCreateDiff(runId: string, opts?: { includeUnchanged?: boolean }): Promise<SkillDiffEntry[]>;
      readCreateDiffFile(runId: string, relativePath: string): Promise<SkillDiffFilePayload>;
      getCreateTimeline(runId: string): Promise<FixTimelineEntry[]>;
      getCreateUsage(runId: string): Promise<FixUsage>;
      runCreateEvals(request: {
        runId: string;
        evalNames?: string[];
      }): Promise<StartEvalRunResponse>;

      // Draft files (temp workdir preview for fix + create)
      listSkillAgentTempFiles(runId: string): Promise<SkillAgentTempFileEntry[]>;
      readSkillAgentTempFile(runId: string, relativePath: string): Promise<SkillAgentTempFileContent>;


      onScanProgress(cb: (progress: ScanProgress) => void): () => void;

      // .claude/ configuration explorer (read-only V1)
      scanClaudeConfig(projectId: string): Promise<ClaudeConfigSnapshot | null>;
      readClaudeConfigFile(projectId: string, relativePath: string): Promise<string | null>;

      // .claude/rules/ editor (Module 1 V2)
      listClaudeRules(projectId: string): Promise<RuleEntry[]>;
      readClaudeRule(projectId: string, name: string): Promise<RuleFileContent | null>;
      createClaudeRule(
        projectId: string,
        request: CreateRuleRequest,
      ): Promise<RuleMutationResult>;
      saveClaudeRule(projectId: string, request: SaveRuleRequest): Promise<RuleMutationResult>;
      deleteClaudeRule(projectId: string, name: string): Promise<RuleMutationResult>;
      /** Project-aware path-glob suggestions for the rule editor. */
      suggestClaudeRulePaths(projectId: string): Promise<string[]>;

      // .claude/agents/ editor (Module 2 V2)
      listClaudeAgents(projectId: string): Promise<AgentEntry[]>;
      readClaudeAgent(projectId: string, name: string): Promise<AgentFileContent | null>;
      createClaudeAgent(
        projectId: string,
        request: CreateAgentRequest,
      ): Promise<AgentMutationResult>;
      saveClaudeAgent(
        projectId: string,
        request: SaveAgentRequest,
      ): Promise<AgentMutationResult>;
      deleteClaudeAgent(projectId: string, name: string): Promise<AgentMutationResult>;

      // .claude/output-styles/ editor (Module 3 V2)
      listClaudeOutputStyles(projectId: string): Promise<OutputStylesListResult>;
      readClaudeOutputStyle(
        projectId: string,
        name: string,
      ): Promise<OutputStyleFileContent | null>;
      createClaudeOutputStyle(
        projectId: string,
        request: CreateOutputStyleRequest,
      ): Promise<OutputStyleMutationResult>;
      saveClaudeOutputStyle(
        projectId: string,
        request: SaveOutputStyleRequest,
      ): Promise<OutputStyleMutationResult>;
      deleteClaudeOutputStyle(
        projectId: string,
        name: string,
      ): Promise<OutputStyleMutationResult>;

      // .claude/settings.json (+ .local) permissions editor (Module 4 V2)
      readClaudePermissions(
        projectId: string,
        scope: PermissionsScope,
      ): Promise<PermissionsFileContent | null>;
      saveClaudePermissions(
        projectId: string,
        request: SavePermissionsRequest,
      ): Promise<PermissionsMutationResult>;

      // .mcp.json editor (Module 5 V2)
      listClaudeMcp(projectId: string): Promise<McpInfo>;
      readClaudeMcpServer(
        projectId: string,
        name: string,
      ): Promise<McpServerForEditor | null>;
      createClaudeMcpServer(
        projectId: string,
        request: CreateMcpServerRequest,
      ): Promise<McpMutationResult>;
      saveClaudeMcpServer(
        projectId: string,
        request: SaveMcpServerRequest,
      ): Promise<McpMutationResult>;
      deleteClaudeMcpServer(
        projectId: string,
        name: string,
        mtimeAtRead: string,
      ): Promise<McpMutationResult>;

      // .claude/settings.json hooks editor (Module 6 V2)
      readClaudeHooks(
        projectId: string,
        scope: PermissionsScope,
      ): Promise<HooksFileContent | null>;
      saveClaudeHooks(
        projectId: string,
        request: SaveHooksRequest,
      ): Promise<HooksMutationResult>;

      // CLAUDE.md editor (Module 7 V2) — root CLAUDE.md only
      listClaudeMd(projectId: string): Promise<ClaudeMdListResult>;
      readClaudeMd(projectId: string): Promise<ClaudeMdFileContent | null>;
      saveClaudeMdFile(
        projectId: string,
        request: SaveClaudeMdRequest,
      ): Promise<ClaudeMdMutationResult>;
      deleteClaudeMd(projectId: string): Promise<ClaudeMdMutationResult>;
      // CLAUDE.md audit history — archived reports under
      // ~/.nakiros/<projectId>/claudemd/audit/, populated by audit runs whose
      // request carried `claudemdTarget`.
      listClaudemdAudits(projectId: string): Promise<ClaudeMdAuditHistoryEntry[]>;
      readClaudemdAudit(path: string): Promise<string | null>;

      // Rules CRUD — recursive discovery under .claude/rules/
      listRules(projectId: string): Promise<RulesListResult>;
      readRule(projectId: string, ruleName: string): Promise<RulesReadResult | null>;
      saveRule(
        projectId: string,
        ruleName: string,
        content: string,
        mtimeAtRead: string,
      ): Promise<RulesMutationResult>;
      deleteRule(projectId: string, ruleName: string): Promise<RulesMutationResult>;
      // Rules audit history — archived reports under
      // ~/.nakiros/<projectId>/rules-audits/<ruleName>/, populated by audit
      // runs whose request carried `rulesTarget`.
      listRulesAudits(projectId: string, ruleName: string): Promise<RulesAuditHistoryEntry[]>;
      readRulesAudit(path: string): Promise<string | null>;

      // Subagents CRUD — recursive discovery under .claude/agents/
      listSubagents(projectId: string): Promise<SubagentsListResult>;
      readSubagent(projectId: string, subagentName: string): Promise<SubagentsReadResult | null>;
      saveSubagent(
        projectId: string,
        subagentName: string,
        content: string,
        mtimeAtRead: string,
      ): Promise<SubagentsMutationResult>;
      deleteSubagent(projectId: string, subagentName: string): Promise<SubagentsMutationResult>;
      // Subagents audit history — archived reports under
      // ~/.nakiros/<projectId>/subagents-audits/<subagentName>/, populated by
      // audit runs whose request carried `subagentsTarget`.
      listSubagentsAudits(projectId: string, subagentName: string): Promise<SubagentsAuditHistoryEntry[]>;
      readSubagentsAudit(path: string): Promise<string | null>;

      // Hooks expert (nakiros-hooks-expert) — read/save the hooks block + audit
      // history. NOTE: distinct from readClaudeHooks/saveClaudeHooks (Module 6
      // V2 editor) which expose a structured view per scope.
      readHooks(projectId: string): Promise<HooksReadResult>;
      saveHooks(projectId: string, content: string, mtimeAtRead: string): Promise<HooksExpertMutationResult>;
      listHooksAudits(projectId: string): Promise<HooksAuditHistoryEntry[]>;
      readHooksAudit(path: string): Promise<string | null>;

      // Permissions expert (nakiros-permissions-expert) — read/save the
      // permissions block + audit history. NOTE: distinct from the Module 4 V2
      // form-based editor (claudePermissions:* channels).
      // All methods accept a `scope` to target either settings.json (project)
      // or settings.local.json (local).
      readPermissions(projectId: string, scope: PermissionsExpertScope): Promise<PermissionsReadResult>;
      savePermissions(projectId: string, scope: PermissionsExpertScope, content: string, mtimeAtRead: string): Promise<PermissionsExpertMutationResult>;
      listPermissionsAudits(projectId: string, scope: PermissionsExpertScope): Promise<PermissionsAuditHistoryEntry[]>;
      readPermissionsAudit(path: string): Promise<string | null>;

      // MCP expert (nakiros-mcp-expert) — read/save the entire .mcp.json file
      // + audit history. NOTE: distinct from the Module 5 V2 form-based editor
      // (claudeMcp:* channels) which manages individual MCP servers.
      readMcp(projectId: string): Promise<McpReadResult>;
      saveMcp(projectId: string, content: string, mtimeAtRead: string): Promise<McpExpertMutationResult>;
      listMcpAudits(projectId: string): Promise<McpAuditHistoryEntry[]>;
      readMcpAudit(path: string): Promise<string | null>;

      // Output styles expert (nakiros-output-styles-expert) — CRUD on
      // .claude/output-styles/ files + audit history. NOTE: distinct from the
      // Module 3 V2 form-based editor (claudeOutputStyles:* channels).
      listOutputStyles(projectId: string): Promise<OutputStylesExpertListResult>;
      readOutputStyle(projectId: string, styleName: string): Promise<OutputStylesReadResult | null>;
      saveOutputStyle(
        projectId: string,
        styleName: string,
        content: string,
        mtimeAtRead: string,
      ): Promise<OutputStylesExpertMutationResult>;
      deleteOutputStyle(projectId: string, styleName: string): Promise<OutputStylesExpertMutationResult>;
      // Output-styles audit history — archived reports under
      // ~/.nakiros/<projectId>/output-styles-audits/<styleName>/, populated by
      // audit runs whose request carried `outputStylesTarget`.
      listOutputStylesAudits(
        projectId: string,
        styleName: string,
      ): Promise<OutputStylesAuditHistoryEntry[]>;
      readOutputStylesAudit(path: string): Promise<string | null>;

      // Edit
      startEdit(request: StartAuditRequest): Promise<AuditRun>;
      stopEdit(runId: string): Promise<void>;
      getEditRun(runId: string): Promise<AuditRun | null>;
      sendEditUserMessage(runId: string, message: string): Promise<void>;
      finishEdit(runId: string): Promise<void>;
      listActiveEditRuns(): Promise<AuditRun[]>;
      listAllEditRuns(): Promise<AuditRun[]>;
      getEditBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      onEditEvent(cb: (event: AuditRunEvent) => void): () => void;
      listEditDiff(runId: string, opts?: { includeUnchanged?: boolean }): Promise<SkillDiffEntry[]>;
      readEditDiffFile(runId: string, relativePath: string): Promise<SkillDiffFilePayload>;
      getEditTimeline(runId: string): Promise<FixTimelineEntry[]>;
      getEditUsage(runId: string): Promise<FixUsage>;
      runEditEvals(request: { runId: string; evalNames?: string[]; includeBaseline?: boolean }): Promise<StartEvalRunResponse>;

      // Conversation ingest (Phase A V1 — opt-in Stop-hook pipeline)
      getConversationIngestStatus(): Promise<ConversationIngestStatus>;
      previewConversationIngestHookDiff(): Promise<ConversationIngestHookDiff>;
      enableConversationIngest(): Promise<ConversationIngestMutationResult>;
      disableConversationIngest(): Promise<ConversationIngestMutationResult>;
      purgeConversationIngest(): Promise<ConversationIngestMutationResult>;
      runNowConversationIngest(): Promise<ConversationIngestMutationResult>;
      listConversationIngestProjects(): Promise<ConversationIngestProject[]>;
      listConversationIngestSessions(projectPath?: string): Promise<ConversationIngestSession[]>;
      onConversationIngestProgress(
        cb: (event: ConversationIngestProgressEvent) => void,
      ): () => void;

      // Recommendations — friction-pattern clustering + analyser + apply.
      listRecommendationPatterns(projectId: string): Promise<RecommendationPattern[]>;
      getRecommendationPattern(
        projectId: string,
        patternId: string,
      ): Promise<{ pattern: RecommendationPattern | null; recos: RecoCard[] }>;
      refreshRecommendations(projectId: string): Promise<{ patternCount: number }>;
      analyzeRecommendationPattern(
        req: StartRecommendationAnalyzeRequest,
      ): Promise<{ runId: string }>;
      stopRecommendationAnalyze(runId: string): Promise<void>;
      applyReco(
        projectId: string,
        patternId: string,
        recId: string,
        editedBrief?: string,
      ): Promise<ApplyRecoResponse>;
      dismissReco(
        projectId: string,
        patternId: string,
        recId: string,
      ): Promise<{ ok: boolean }>;
      editRecoBrief(
        projectId: string,
        patternId: string,
        recId: string,
        brief: string,
      ): Promise<{ ok: boolean }>;
      /** Subscribe to live events from a running analyser run. Returns an unsubscribe function. */
      onRecommendationsEvent(cb: (event: RecommendationAnalyzeRunEvent) => void): () => void;
      /** Fired when the pattern list for a project is refreshed (cluster recomputed). */
      onRecommendationsPatternsUpdated(
        cb: (event: { projectId: string; patterns: RecommendationPattern[] }) => void,
      ): () => void;
      /** Fired when an analyser run finishes — carries the updated run object. */
      onRecommendationsPatternAnalyzed(
        cb: (event: { projectId: string; patternId: string; run: RecommendationAnalyzeRun }) => void,
      ): () => void;
      /** Fired when a reco card is applied — carries the updated card. */
      onRecommendationsRecoApplied(
        cb: (event: { projectId: string; patternId: string; reco: RecoCard }) => void,
      ): () => void;
    };
  }
}
