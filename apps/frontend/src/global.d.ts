import type {
  AppPreferences,
  AgentProvider,
  AgentInstallStatus,
  AgentInstallRequest,
  AgentInstallSummary,
  BundledSkillConflict,
  BundledSkillConflictFileDiff,
  BundledSkillConflictResolution,
  SkillDiffEntry,
  SkillDiffFilePayload,
  VersionInfo,
  ResolvedLanguage,
  Project,
  ProjectConversation,
  ConversationMessage,
  ConversationAnalysis,
  Skill,
  SkillScope,
  ScanProgress,
  StartEvalRunRequest,
  StartEvalRunResponse,
  SkillEvalRun,
  EvalRunEvent,
  EvalRunOutputEntry,
  StartAuditRequest,
  AuditRun,
  AuditRunEvent,
  AuditHistoryEntry,
  FixBenchmarks,
  SkillAgentTempFileEntry,
  SkillAgentTempFileContent,
  EvalMatrix,
  GetEvalMatrixRequest,
  IterationRunArtifact,
  LoadIterationRunRequest,
} from '@nakiros/shared';

declare global {
  interface DetectedEditor {
    id: 'claude' | 'cursor' | 'codex';
    label: string;
    detected: boolean;
    targetDir: string;
  }

  interface OnboardingProgressEvent {
    label: string;
    done: boolean;
    error?: string;
  }

  interface OnboardingInstallResult {
    success: boolean;
    errors: string[];
  }

  interface InstalledCommand {
    id: string;
    command: string;
    kind: 'agent' | 'workflow';
    fileName: string;
  }

  interface AgentRunNotificationPayload {
    workspaceId: string;
    workspaceName?: string;
    conversationId?: string | null;
    tabId?: string | null;
    conversationTitle?: string;
    provider?: AgentProvider;
    durationSeconds: number;
  }

  interface OpenAgentRunChatPayload {
    workspaceId: string;
    conversationId?: string | null;
    tabId?: string | null;
    eventId?: string;
  }

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

      listProjectConversations(projectId: string): Promise<ProjectConversation[]>;
      getProjectConversationMessages(projectId: string, sessionId: string): Promise<ConversationMessage[]>;
      analyzeProjectConversation(projectId: string, sessionId: string): Promise<ConversationAnalysis | null>;
      listProjectConversationsWithAnalysis(projectId: string): Promise<ConversationAnalysis[]>;

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

      // Audit
      startAudit(request: StartAuditRequest): Promise<AuditRun>;
      stopAudit(runId: string): Promise<void>;
      getAuditRun(runId: string): Promise<AuditRun | null>;
      sendAuditUserMessage(runId: string, message: string): Promise<void>;
      finishAudit(runId: string): Promise<void>;
      listAuditHistory(request: { scope: SkillScope; marketplaceName?: string; pluginName?: string; projectId?: string; skillName: string }): Promise<AuditHistoryEntry[]>;
      readAuditReport(path: string): Promise<string | null>;
      listActiveAuditRuns(): Promise<AuditRun[]>;
      getAuditBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
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
      getFixBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      onFixEvent(cb: (event: AuditRunEvent) => void): () => void;
      listFixDiff(runId: string): Promise<SkillDiffEntry[]>;
      readFixDiffFile(runId: string, relativePath: string): Promise<SkillDiffFilePayload>;

      // Create (skill-factory "create" command)
      startCreate(request: StartAuditRequest): Promise<AuditRun>;
      stopCreate(runId: string): Promise<void>;
      getCreateRun(runId: string): Promise<AuditRun | null>;
      sendCreateUserMessage(runId: string, message: string): Promise<void>;
      finishCreate(runId: string): Promise<void>;
      listActiveCreateRuns(): Promise<AuditRun[]>;
      getCreateBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      onCreateEvent(cb: (event: AuditRunEvent) => void): () => void;
      listCreateDiff(runId: string): Promise<SkillDiffEntry[]>;
      readCreateDiffFile(runId: string, relativePath: string): Promise<SkillDiffFilePayload>;

      // Draft files (temp workdir preview for fix + create)
      listSkillAgentTempFiles(runId: string): Promise<SkillAgentTempFileEntry[]>;
      readSkillAgentTempFile(runId: string, relativePath: string): Promise<SkillAgentTempFileContent>;

      onScanProgress(cb: (progress: ScanProgress) => void): () => void;
    };
  }
}
