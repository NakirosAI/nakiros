import type {
  StoredWorkspace,
  AgentProfile,
  LocalTicket,
  LocalEpic,
  AppPreferences,
  AgentRunRequest,
  AgentProvider,
  AgentInstallStatus,
  AgentInstallRequest,
  AgentInstallSummary,
  ResolvedLanguage,
  StoredConversation,
  StoredAgentTabsState,
  WorkspaceGettingStartedContext,
  WorkspaceGettingStartedState,
  FileChangesReviewSession,
  SnapshotMeta,
  Project,
  ProjectConversation,
  ConversationMessage,
  Skill,
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

  interface ScannedDoc {
    name: string;
    relativePath: string;
    absolutePath: string;
    isGenerated: boolean;
    isRemote?: boolean;
    lastModifiedAt?: number;
    charCount?: number;
  }

  interface ScannedRepo {
    repoName: string;
    repoPath: string;
    docs: ScannedDoc[];
  }

  interface GlobalSection {
    docs: ScannedDoc[];
    decisionDocs: ScannedDoc[];
    missingNames: string[];
  }

  interface ScanResult {
    repos: ScannedRepo[];
    globalSection: GlobalSection;
    primaryRepoPath: string;
  }

  type AgentStreamEvent =
    | { type: 'text'; text: string }
    | { type: 'tool'; name: string; display: string }
    | { type: 'session'; id: string };

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
      // Workspace
      selectDirectory(): Promise<string | null>;
      openFilePicker(): Promise<string | null>;
      getWorkspaces(): Promise<StoredWorkspace[]>;
      saveWorkspace(w: StoredWorkspace): Promise<void>;
      deleteWorkspace(id: string): Promise<void>;
      createWorkspaceRoot(parentDir: string, workspaceName: string): Promise<string>;
      detectProfile(localPath: string): Promise<AgentProfile>;
      copyLocalRepo(sourcePath: string, targetParentDir: string): Promise<{ repoPath: string; repoName: string }>;
      syncWorkspace(w: StoredWorkspace): Promise<void>;
      syncWorkspaceYaml(workspace: StoredWorkspace): Promise<string>;
      resetWorkspace(workspace: StoredWorkspace): Promise<{ deletedPaths: string[]; errors: Array<{ path: string; error: string }> }>;
      getWorkspaceGettingStartedContext(workspace: StoredWorkspace): Promise<WorkspaceGettingStartedContext>;
      saveWorkspaceGettingStartedState(workspaceName: string, state: WorkspaceGettingStartedState): Promise<void>;
      openPath(path: string): Promise<void>;
      gitRemoteUrl(repoPath: string): Promise<string | null>;
      gitClone(url: string, parentDir: string): Promise<{ success: boolean; repoPath: string; repoName: string; error?: string }>;
      gitInit(repoPath: string): Promise<{ success: boolean; error?: string }>;
      getPreferences(): Promise<AppPreferences>;
      getSystemLanguage(): Promise<ResolvedLanguage>;
      savePreferences(prefs: AppPreferences): Promise<void>;
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

      // Tickets
      getTickets(wsId: string): Promise<LocalTicket[]>;
      saveTicket(wsId: string, t: LocalTicket): Promise<void>;
      removeTicket(wsId: string, id: string): Promise<void>;

      // Epics
      getEpics(wsId: string): Promise<LocalEpic[]>;
      saveEpic(wsId: string, e: LocalEpic): Promise<void>;
      removeEpic(wsId: string, id: string): Promise<void>;

      // Agent context + clipboard
      generateContext(wsId: string, ticketId: string, ws: StoredWorkspace): Promise<string>;
      writeClipboard(text: string): Promise<void>;

      // Agent runner
      agentRun(request: AgentRunRequest): Promise<string>;
      agentCancel(runId: string): Promise<void>;
      onAgentStart(cb: (event: { runId: string; command: string; cwd: string; conversationId?: string; agentId?: string }) => void): () => void;
      onAgentEvent(cb: (payload: { runId: string; event: AgentStreamEvent }) => void): () => void;
      onAgentDone(cb: (event: { runId: string; exitCode: number; error?: string; rawLines?: unknown[] }) => void): () => void;
      showAgentRunNotification(payload: AgentRunNotificationPayload): Promise<void>;
      onOpenAgentRunChat(cb: (payload: OpenAgentRunChatPayload) => void): () => void;

      // Terminal
      terminalCreate(repoPath: string): Promise<string>;
      terminalWrite(terminalId: string, data: string): Promise<void>;
      terminalResize(terminalId: string, cols: number, rows: number): Promise<void>;
      terminalDestroy(terminalId: string): Promise<void>;
      onTerminalData(cb: (event: { terminalId: string; data: string }) => void): () => void;
      onTerminalExit(cb: (event: { terminalId: string; code: number }) => void): () => void;

      // Conversations
      getConversations(workspaceId: string): Promise<StoredConversation[]>;
      saveConversation(conv: StoredConversation): Promise<void>;
      deleteConversation(id: string, workspaceId: string): Promise<void>;
      getAgentTabs(workspaceId: string): Promise<StoredAgentTabsState | null>;
      saveAgentTabs(workspaceId: string, state: StoredAgentTabsState): Promise<void>;
      clearAgentTabs(workspaceId: string): Promise<void>;

      // Docs
      scanDocs(workspace: StoredWorkspace): Promise<ScanResult>;
      readDoc(absolutePath: string): Promise<string>;
      writeDoc(absolutePath: string, content: string): Promise<void>;
      watchDoc(absolutePath: string): Promise<void>;
      unwatchDoc(absolutePath: string): Promise<void>;
      onDocChanged(cb: (absolutePath: string) => void): () => void;

      // Artifacts (local only)
      artifactListContextFiles(workspace: StoredWorkspace): Promise<string[]>;
      artifactReadFile(workspace: StoredWorkspace, artifactPath: string): Promise<string | null>;
      artifactGetFilePath(workspace: StoredWorkspace, artifactPath: string): Promise<string>;
      artifactGetContextTotalBytes(workspace: StoredWorkspace): Promise<number>;
      artifactListContextFilesWithSizes(workspace: StoredWorkspace): Promise<{ path: string; sizeBytes: number }[]>;

      // Snapshots
      snapshotTake(workspaceSlug: string, runId: string): Promise<void>;
      snapshotDiff(workspaceSlug: string, runId: string): Promise<FileChangesReviewSession | null>;
      snapshotRevert(workspaceSlug: string, runId: string, relativePaths?: string[]): Promise<void>;
      snapshotResolve(workspaceSlug: string, runId: string): Promise<void>;
      snapshotListPending(workspaceSlug: string): Promise<SnapshotMeta[]>;

      // Preview
      previewCheck(workspaceSlug: string): Promise<{ exists: boolean; previewRoot: string; files: string[]; conversationId: string | null }>;
      previewApply(previewRoot: string, workspaceSlug: string): Promise<void>;
      previewApplyFile(previewRoot: string, filePath: string, workspaceSlug: string): Promise<void>;
      previewDiscard(previewRoot: string): Promise<void>;

      // MCP Server
      getServerStatus(): Promise<'starting' | 'running' | 'stopped'>;
      restartServer(): Promise<void>;
      onServerStatusChange(cb: (status: 'starting' | 'running' | 'stopped') => void): () => void;

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

      // User-global skills (~/.claude/skills/, excluding our symlinks)
      listClaudeGlobalSkills(): Promise<Skill[]>;
      getClaudeGlobalSkill(skillName: string): Promise<Skill | null>;
      readClaudeGlobalSkillFile(skillName: string, relativePath: string): Promise<string | null>;
      saveClaudeGlobalSkillFile(skillName: string, relativePath: string, content: string): Promise<void>;
      readSkillFileAsDataUrl(request: { scope: 'project' | 'nakiros-bundled' | 'claude-global'; projectId?: string; skillName: string; relativePath: string }): Promise<string | null>;

      // Eval runner
      startEvalRuns(request: StartEvalRunRequest): Promise<StartEvalRunResponse>;
      stopEvalRun(runId: string): Promise<void>;
      listEvalRuns(): Promise<SkillEvalRun[]>;
      loadPersistedEvalRuns(request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string }): Promise<SkillEvalRun[]>;
      onEvalEvent(cb: (event: EvalRunEvent) => void): () => void;
      sendEvalUserMessage(runId: string, message: string): Promise<void>;
      finishEvalRun(runId: string): Promise<void>;
      getEvalFeedback(request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string; iteration: number }): Promise<Record<string, string>>;
      saveEvalFeedback(request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string; iteration: number; evalName: string; feedback: string }): Promise<void>;
      listEvalRunOutputs(runId: string): Promise<EvalRunOutputEntry[]>;
      readEvalRunOutput(runId: string, relativePath: string): Promise<string | null>;

      // Audit
      startAudit(request: StartAuditRequest): Promise<AuditRun>;
      stopAudit(runId: string): Promise<void>;
      getAuditRun(runId: string): Promise<AuditRun | null>;
      sendAuditUserMessage(runId: string, message: string): Promise<void>;
      listAuditHistory(request: { scope: 'project' | 'nakiros-bundled'; projectId?: string; skillName: string }): Promise<AuditHistoryEntry[]>;
      readAuditReport(path: string): Promise<string | null>;
      listActiveAuditRuns(): Promise<AuditRun[]>;
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

      // Create (skill-factory "create" command)
      startCreate(request: StartAuditRequest): Promise<AuditRun>;
      stopCreate(runId: string): Promise<void>;
      getCreateRun(runId: string): Promise<AuditRun | null>;
      sendCreateUserMessage(runId: string, message: string): Promise<void>;
      finishCreate(runId: string): Promise<void>;
      listActiveCreateRuns(): Promise<AuditRun[]>;
      getCreateBufferedEvents(runId: string): Promise<AuditRunEvent['event'][]>;
      onCreateEvent(cb: (event: AuditRunEvent) => void): () => void;

      // Draft files (temp workdir preview for fix + create)
      listSkillAgentTempFiles(runId: string): Promise<SkillAgentTempFileEntry[]>;
      readSkillAgentTempFile(runId: string, relativePath: string): Promise<SkillAgentTempFileContent>;

      onScanProgress(cb: (progress: ScanProgress) => void): () => void;
    };
  }
}
