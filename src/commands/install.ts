import type { Command } from "commander";
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
import { loadRuntimeConfig, type RuntimeConfig } from "../utils/config.js";
import { ensureJiraMcpConfigured } from "../utils/jira-mcp.js";

const INVALID_INSTALL_CONFIG_ERROR_MESSAGE =
  "✗ No valid .tiqora.yaml found. Run npx tiqora init first.";

export interface InstallCommandOptions extends ResolveEnvironmentTargetOptions {
  force?: boolean;
  templateSourceDir?: string;
  runtimeSourceDir?: string;
  projectRoot?: string;
  confirmOverwrite?: ConfirmOverwrite;
}

export interface InstallCommandResult extends EnvironmentTargetResolution {
  deploymentSummary: AgentDeploymentSummary;
}

export async function runInstallCommand(
  options: InstallCommandOptions = {}
): Promise<InstallCommandResult> {
  const projectRoot = options.projectRoot ?? options.cwd ?? process.cwd();
  const runtimeConfig = ensureValidInstallConfig(projectRoot);

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

  if (runtimeConfig.pm_tool === "jira") {
    ensureJiraMcpConfigured({
      projectRoot,
      homeDir: options.homeDir,
      selectedTargets: resolution.selectedTargets
    });
  }

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
    deploymentSummary
  };
}

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .description("Install tiqora assets into the selected environment.")
    .option("-f, --force", "Overwrite existing command files without prompting.")
    .action((commandOptions: { force?: boolean }) => {
      void runInstallCommand({ force: Boolean(commandOptions.force) })
        .then((result) => {
          printDeploymentSummary(result.deploymentSummary);
          console.log("✓ tiqora installed");
        })
        .catch(handleCommandError);
    });
}

function ensureValidInstallConfig(projectRoot: string): RuntimeConfig {
  try {
    return loadRuntimeConfig({ startDir: projectRoot });
  } catch {
    throw new Error(INVALID_INSTALL_CONFIG_ERROR_MESSAGE);
  }
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

function handleCommandError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message.startsWith("✗") ? message : `✗ ${message}`);
  return process.exit(1);
}
