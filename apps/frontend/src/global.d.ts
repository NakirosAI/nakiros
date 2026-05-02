import type {
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
  ResolvedLanguage,
  Project,
  ProjectAggregate,
  ProjectConversation,
  ConversationMessage,
  ConversationAnalysis,
  ConversationDeepAnalysis,
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
} from '@nakiros/shared';

declare global {
  interface Window {
    nakiros: {
      // Generic shell / clipboard
      openPath(path: string): Promise<void>;
      writeClipboard(text: string): Promise<void>;

      // Meta
      getVersionInfo(options?: { force?: boolean }): Promise<VersionInfo>;

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
      listFixDiff(runId: string): Promise<SkillDiffEntry[]>;
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
      listCreateDiff(runId: string): Promise<SkillDiffEntry[]>;
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
    };
  }
}
