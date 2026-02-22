import type { Command } from "commander";
import { cancel, isCancel, select, text } from "@clack/prompts";
import {
  resolveEnvironmentTarget,
  type EnvironmentTargetResolution,
  type ResolveEnvironmentTargetOptions
} from "../utils/env-detect.js";
import {
  deployAgentAssets,
  type AgentDeploymentSummary,
  type ConfirmOverwrite
} from "../utils/file-ops.js";
import { suggestBranchPattern } from "../utils/git-branch-pattern.js";
import {
  DEFAULT_COMMUNICATION_LANGUAGE,
  DEFAULT_DOCUMENT_LANGUAGE,
  DEFAULT_USER_NAME,
  type ExistingInitConfig,
  type InitGitHost,
  type InitPmTool,
  type InitWizardAnswers,
  readExistingInitConfig,
  writeGlobalUserConfig,
  writeProjectInitConfig
} from "../utils/init-config.js";
import { ensureJiraMcpConfigured } from "../utils/jira-mcp.js";

export interface InitCommandOptions extends ResolveEnvironmentTargetOptions {
  force?: boolean;
  templateSourceDir?: string;
  runtimeSourceDir?: string;
  projectRoot?: string;
  confirmOverwrite?: ConfirmOverwrite;
  collectInitAnswers?: (
    context: CollectInitAnswersContext
  ) => Promise<InitWizardAnswers | null>;
  branchPatternSuggester?: (options: { cwd: string }) => string;
}

export interface InitCommandResult extends EnvironmentTargetResolution {
  deploymentSummary: AgentDeploymentSummary;
  configPath: string;
  userConfigPath: string;
}

export interface CollectInitAnswersContext {
  cwd: string;
  suggestedBranchPattern: string;
  existingConfig?: ExistingInitConfig | null;
}

export async function runInitCommand(
  options: InitCommandOptions = {}
): Promise<InitCommandResult> {
  const projectRoot = options.projectRoot ?? options.cwd ?? process.cwd();
  const resolution = await resolveEnvironmentTarget({
    cwd: options.cwd,
    homeDir: options.homeDir,
    allowMultipleSelections: options.allowMultipleSelections ?? true,
    selectEnvironment: options.selectEnvironment,
    selectEnvironments: options.selectEnvironments,
    promptManualPath: options.promptManualPath,
    validateTargetPath: options.validateTargetPath,
    manualPathBaseDir: options.manualPathBaseDir
  });

  const branchPatternSuggester =
    options.branchPatternSuggester ?? suggestBranchPattern;
  const existingConfig = readExistingInitConfig({
    projectRoot,
    homeDir: options.homeDir
  });
  const suggestedBranchPattern =
    existingConfig?.branchPattern ?? branchPatternSuggester({ cwd: projectRoot });
  const collectInitAnswers =
    options.collectInitAnswers ?? defaultCollectInitAnswers;
  const answers = await collectInitAnswers({
    cwd: projectRoot,
    suggestedBranchPattern,
    existingConfig
  });

  if (!answers) {
    throw new Error("Init wizard cancelled.");
  }

  if (answers.pmTool === "jira") {
    ensureJiraMcpConfigured({
      projectRoot,
      homeDir: options.homeDir,
      selectedTargets: resolution.selectedTargets
    });
  }

  const configPath = writeProjectInitConfig({
    projectRoot,
    answers,
    allowOverwrite: true
  });
  const userConfigPath = writeGlobalUserConfig({
    homeDir: options.homeDir,
    answers
  });

  const deploymentSummary = await deployAgentAssets({
    selectedTargets: resolution.selectedTargets,
    templateSourceDir: options.templateSourceDir,
    runtimeSourceDir: options.runtimeSourceDir,
    projectRoot,
    force: options.force ?? false,
    confirmOverwrite: options.confirmOverwrite
  });

  return {
    ...resolution,
    deploymentSummary,
    configPath,
    userConfigPath
  };
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize tiqora in this repository.")
    .option("-f, --force", "Overwrite existing command files without prompting.")
    .action((commandOptions: { force?: boolean }) => {
      void runInitCommand({ force: Boolean(commandOptions.force) })
        .then((result) => {
          printInitSummary(result);
        })
        .catch(handleCommandError);
    });
}

function printInitSummary(result: InitCommandResult): void {
  console.log(`Created config: ${result.configPath}`);
  console.log(`Updated user profile: ${result.userConfigPath}`);
  printDeploymentSummary(result.deploymentSummary);
}

function printDeploymentSummary(summary: AgentDeploymentSummary): void {
  if (summary.deployedTargets.length === 1) {
    console.log(`Deployment target: ${summary.deployedTargets[0]}`);
  } else {
    console.log(
      `Deployment targets (${summary.deployedTargets.length}):\n- ${summary.deployedTargets.join(
        "\n- "
      )}`
    );
  }

  console.log(
    `Deployment summary: copied=${summary.filesCopied.length}, overwritten=${summary.filesOverwritten.length}, skipped=${summary.filesSkipped.length}`
  );
  console.log(
    summary.gitignorePatched
      ? "Patched .gitignore with .tiqora/."
      : ".gitignore already contains .tiqora/."
  );
  console.log(
    summary.runtimeSummary.sourceFound
      ? `Runtime summary (_tiqora): copied=${summary.runtimeSummary.filesCopied.length}, overwritten=${summary.runtimeSummary.filesOverwritten.length}, skipped=${summary.runtimeSummary.filesSkipped.length}`
      : "Runtime summary (_tiqora): source not found, skipped."
  );
  console.log(
    `Workspace summary: created=${summary.workspaceSummary.directoriesCreated.length}`
  );
}

async function defaultCollectInitAnswers(
  context: CollectInitAnswersContext
): Promise<InitWizardAnswers | null> {
  const pmToolAnswer = await select({
    message: "Project management tool:",
    options: [
      { value: "jira", label: "Jira" },
      { value: "gitlab", label: "GitLab" },
      { value: "none", label: "None" }
    ],
    initialValue: context.existingConfig?.pmTool
  });

  if (isCancel(pmToolAnswer)) {
    cancel("Operation cancelled.");
    return null;
  }

  const gitHostAnswer = await select({
    message: "Git host:",
    options: [
      { value: "gitlab", label: "GitLab" },
      { value: "github", label: "GitHub" }
    ],
    initialValue: context.existingConfig?.gitHost
  });

  if (isCancel(gitHostAnswer)) {
    cancel("Operation cancelled.");
    return null;
  }

  const branchPatternAnswer = await text({
    message: "Branch naming pattern:",
    initialValue: context.suggestedBranchPattern,
    placeholder: "feature/*",
    validate(value) {
      if (value.trim().length === 0) {
        return "Branch pattern cannot be empty.";
      }

      return undefined;
    }
  });

  if (isCancel(branchPatternAnswer)) {
    cancel("Operation cancelled.");
    return null;
  }

  const pmTool = String(pmToolAnswer) as InitPmTool;
  const answers: InitWizardAnswers = {
    pmTool,
    gitHost: String(gitHostAnswer) as InitGitHost,
    branchPattern: String(branchPatternAnswer).trim()
  };

  const userNameAnswer = await text({
    message: "Your name (for agent interactions):",
    defaultValue:
      context.existingConfig?.userName ??
      process.env.USER ??
      DEFAULT_USER_NAME,
    placeholder: "Developer",
    validate(value) {
      if (value.trim().length === 0) {
        return "Name cannot be empty.";
      }

      return undefined;
    }
  });

  if (isCancel(userNameAnswer)) {
    cancel("Operation cancelled.");
    return null;
  }

  const communicationLanguageAnswer = await text({
    message: "Agent response language (e.g. Français, English, Español):",
    initialValue:
      context.existingConfig?.communicationLanguage ??
      DEFAULT_COMMUNICATION_LANGUAGE,
    validate(value) {
      if (value.trim().length === 0) {
        return "Language cannot be empty.";
      }

      return undefined;
    }
  });

  if (isCancel(communicationLanguageAnswer)) {
    cancel("Operation cancelled.");
    return null;
  }

  const documentLanguageAnswer = await text({
    message: "Document output language (e.g. Français, English, Español):",
    initialValue:
      context.existingConfig?.documentLanguage ?? DEFAULT_DOCUMENT_LANGUAGE,
    validate(value) {
      if (value.trim().length === 0) {
        return "Language cannot be empty.";
      }

      return undefined;
    }
  });

  if (isCancel(documentLanguageAnswer)) {
    cancel("Operation cancelled.");
    return null;
  }

  answers.communicationLanguage = String(communicationLanguageAnswer).trim();
  answers.documentLanguage = String(documentLanguageAnswer).trim();
  answers.userName = String(userNameAnswer).trim();

  if (pmTool === "jira") {
    const projectKeyAnswer = await text({
      message: "Jira project key:",
      placeholder: "PROJ",
      initialValue: context.existingConfig?.jira?.projectKey,
      validate(value) {
        if (value.trim().length === 0) {
          return "Project key is required.";
        }

        return undefined;
      }
    });

    if (isCancel(projectKeyAnswer)) {
      cancel("Operation cancelled.");
      return null;
    }

    const boardIdAnswer = await text({
      message: "Jira board id:",
      placeholder: "123",
      initialValue: context.existingConfig?.jira?.boardId,
      validate(value) {
        if (value.trim().length === 0) {
          return "Board id is required.";
        }

        return undefined;
      }
    });

    if (isCancel(boardIdAnswer)) {
      cancel("Operation cancelled.");
      return null;
    }

    answers.jira = {
      projectKey: String(projectKeyAnswer).trim(),
      boardId: String(boardIdAnswer).trim()
    };
  }

  return answers;
}

function handleCommandError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message.startsWith("✗") ? message : `✗ ${message}`);
  return process.exit(1);
}
