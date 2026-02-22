import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { cancel, confirm, isCancel } from "@clack/prompts";

import type { SelectedEnvironment } from "./env-detect.js";

export const COMMAND_TEMPLATE_FILES = [
  "tiq-agent-dev.md",
  "tiq-agent-sm.md",
  "tiq-agent-pm.md",
  "tiq-workflow-create-story.md",
  "tiq-workflow-dev-story.md",
  "tiq-workflow-fetch-project-context.md",
  "tiq-workflow-create-ticket.md"
] as const;

export type CommandTemplateFile = (typeof COMMAND_TEMPLATE_FILES)[number];

export interface CommandTemplateManifestEntry {
  fileName: CommandTemplateFile;
  sourcePath: string;
}

export interface CommandTemplateDeploymentSummary {
  deployedTargets: string[];
  filesCopied: string[];
  filesOverwritten: string[];
  filesSkipped: string[];
}

export interface AgentDeploymentSummary extends CommandTemplateDeploymentSummary {
  gitignorePatched: boolean;
  runtimeSummary: TiqoraRuntimeDeploymentSummary;
  workspaceSummary: WorkspaceBootstrapSummary;
}

export interface ConfirmOverwriteArgs {
  targetPath: string;
  templateFile: CommandTemplateFile;
}

export type ConfirmOverwrite = (args: ConfirmOverwriteArgs) => Promise<boolean>;

export interface DeployCommandTemplatesOptions {
  selectedTargets: Array<Pick<SelectedEnvironment, "targetPath">>;
  templateSourceDir?: string;
  force?: boolean;
  confirmOverwrite?: ConfirmOverwrite;
}

export interface PatchGitignoreOptions {
  projectRoot?: string;
}

export interface DeployAgentAssetsOptions extends DeployCommandTemplatesOptions {
  projectRoot?: string;
  runtimeSourceDir?: string;
}

export interface BootstrapTiqoraWorkspaceOptions {
  projectRoot?: string;
}

export interface WorkspaceBootstrapSummary {
  workspaceRoot: string;
  directoriesCreated: string[];
}

export interface TiqoraRuntimeDeploymentSummary {
  sourceFound: boolean;
  sourcePath: string | null;
  runtimeRoot: string;
  filesCopied: string[];
  filesOverwritten: string[];
  filesSkipped: string[];
}

export const TIQORA_WORKSPACE_DIRECTORIES = [
  "config",
  "state",
  "agents/sessions",
  "workflows/runs",
  "workflows/steps",
  "sessions",
  "sprints",
  "reports/daily",
  "reports/retrospective",
  "reports/mr-context",
  "sync",
  "migrations"
] as const;

const TIQORA_WORKSPACE_ROOT = ".tiqora";
const TIQORA_RUNTIME_ROOT = "_tiqora";

export class MissingTemplateFileError extends Error {
  readonly code = "MISSING_TEMPLATE_FILE";

  constructor(
    readonly templateFile: CommandTemplateFile,
    readonly templatePath: string
  ) {
    super(`Missing required template file: ${templatePath}`);
    this.name = "MissingTemplateFileError";
  }
}

export function resolveTemplateSourceDir(startDir?: string): string {
  const startDirs = getSearchRoots(startDir);

  for (const initialCursor of startDirs) {
    let cursor = initialCursor;

    for (let level = 0; level <= 6; level += 1) {
      const candidate = resolve(cursor, "templates", "commands");
      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = dirname(cursor);
      if (parent === cursor) {
        break;
      }

      cursor = parent;
    }
  }

  return resolve(process.cwd(), "templates", "commands");
}

export function getCommandTemplateManifest(templateSourceDir?: string): CommandTemplateManifestEntry[] {
  const sourceDir = resolve(templateSourceDir ?? resolveTemplateSourceDir());

  return COMMAND_TEMPLATE_FILES.map((fileName) => {
    const sourcePath = resolve(sourceDir, fileName);
    if (!existsSync(sourcePath)) {
      throw new MissingTemplateFileError(fileName, sourcePath);
    }

    return {
      fileName,
      sourcePath
    };
  });
}

export async function deployCommandTemplates(
  options: DeployCommandTemplatesOptions
): Promise<CommandTemplateDeploymentSummary> {
  if (!options.selectedTargets.length) {
    throw new Error("No deployment targets were provided.");
  }

  const manifest = getCommandTemplateManifest(options.templateSourceDir);
  const askOverwrite = options.confirmOverwrite ?? defaultConfirmOverwrite;
  const force = options.force ?? false;

  const summary: CommandTemplateDeploymentSummary = {
    deployedTargets: [],
    filesCopied: [],
    filesOverwritten: [],
    filesSkipped: []
  };
  let overwriteDecision: boolean | undefined;

  for (const selectedTarget of options.selectedTargets) {
    const targetPath = resolve(selectedTarget.targetPath);
    mkdirSync(targetPath, { recursive: true });
    summary.deployedTargets.push(targetPath);

    for (const templateEntry of manifest) {
      const outputPath = resolve(targetPath, templateEntry.fileName);

      if (!existsSync(outputPath)) {
        copyFileSync(templateEntry.sourcePath, outputPath);
        summary.filesCopied.push(outputPath);
        continue;
      }

      if (force) {
        copyFileSync(templateEntry.sourcePath, outputPath);
        summary.filesOverwritten.push(outputPath);
        continue;
      }

      if (overwriteDecision === undefined) {
        overwriteDecision = await askOverwrite({
          targetPath: outputPath,
          templateFile: templateEntry.fileName
        });
      }

      if (overwriteDecision) {
        copyFileSync(templateEntry.sourcePath, outputPath);
        summary.filesOverwritten.push(outputPath);
      } else {
        summary.filesSkipped.push(outputPath);
      }
    }
  }

  return summary;
}

export function patchGitignoreWithTiqora(options: PatchGitignoreOptions = {}): boolean {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const gitignorePath = resolve(projectRoot, ".gitignore");

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, ".tiqora/\n", "utf8");
    return true;
  }

  const current = readFileSync(gitignorePath, "utf8");
  const normalized = current.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.includes(".tiqora/")) {
    return false;
  }

  const withTrailingNewline = normalized.endsWith("\n")
    ? normalized
    : `${normalized}\n`;
  const nextContent = `${withTrailingNewline}.tiqora/\n`;
  writeFileSync(gitignorePath, nextContent, "utf8");
  return true;
}

export async function deployAgentAssets(options: DeployAgentAssetsOptions): Promise<AgentDeploymentSummary> {
  const deployment = await deployCommandTemplates(options);
  const workspaceSummary = bootstrapTiqoraWorkspace({
    projectRoot: options.projectRoot
  });
  const runtimeSummary = deployTiqoraRuntimeAssets({
    projectRoot: options.projectRoot,
    runtimeSourceDir: options.runtimeSourceDir,
    force: options.force
  });
  const gitignorePatched = patchGitignoreWithTiqora({
    projectRoot: options.projectRoot
  });

  return {
    ...deployment,
    gitignorePatched,
    runtimeSummary,
    workspaceSummary
  };
}

export interface DeployTiqoraRuntimeAssetsOptions {
  projectRoot?: string;
  runtimeSourceDir?: string;
  force?: boolean;
}

export function deployTiqoraRuntimeAssets(
  options: DeployTiqoraRuntimeAssetsOptions = {}
): TiqoraRuntimeDeploymentSummary {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const runtimeRoot = resolve(projectRoot, TIQORA_RUNTIME_ROOT);
  const sourcePath = options.runtimeSourceDir
    ? resolve(options.runtimeSourceDir)
    : resolveTiqoraRuntimeSourceDir(projectRoot);
  const force = options.force ?? false;

  const summary: TiqoraRuntimeDeploymentSummary = {
    sourceFound: false,
    sourcePath,
    runtimeRoot,
    filesCopied: [],
    filesOverwritten: [],
    filesSkipped: []
  };

  if (!sourcePath) {
    return summary;
  }

  const sourceWorkflowEngine = resolve(sourcePath, "core", "tasks", "workflow.xml");
  if (!existsSync(sourceWorkflowEngine)) {
    return summary;
  }

  summary.sourceFound = true;
  syncRuntimeTree({
    sourcePath,
    targetPath: runtimeRoot,
    projectRoot,
    force,
    summary
  });

  return summary;
}

export function bootstrapTiqoraWorkspace(
  options: BootstrapTiqoraWorkspaceOptions = {}
): WorkspaceBootstrapSummary {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const workspaceRoot = resolve(projectRoot, TIQORA_WORKSPACE_ROOT);
  const directoriesCreated: string[] = [];

  for (const relativeDir of TIQORA_WORKSPACE_DIRECTORIES) {
    const directoryPath = resolve(workspaceRoot, relativeDir);
    if (!existsSync(directoryPath)) {
      directoriesCreated.push(toProjectRelativePath(projectRoot, directoryPath));
    }
    mkdirSync(directoryPath, { recursive: true });
  }

  return {
    workspaceRoot,
    directoriesCreated
  };
}

async function defaultConfirmOverwrite(args: ConfirmOverwriteArgs): Promise<boolean> {
  const answer = await confirm({
    message:
      "Existing command files were found. Do you want to update all command files for this run?",
    initialValue: false,
    active: "Yes, update all",
    inactive: "No, keep existing"
  });

  if (isCancel(answer)) {
    cancel("Operation cancelled.");
    throw new Error("Overwrite confirmation was cancelled.");
  }

  return Boolean(answer);
}

interface SyncRuntimeTreeOptions {
  sourcePath: string;
  targetPath: string;
  projectRoot: string;
  force: boolean;
  summary: TiqoraRuntimeDeploymentSummary;
}

function syncRuntimeTree(options: SyncRuntimeTreeOptions): void {
  const sourceStats = lstatSync(options.sourcePath);

  if (sourceStats.isDirectory()) {
    mkdirSync(options.targetPath, { recursive: true });
    const entries = readdirSync(options.sourcePath, { withFileTypes: true });

    for (const entry of entries) {
      syncRuntimeTree({
        ...options,
        sourcePath: resolve(options.sourcePath, entry.name),
        targetPath: resolve(options.targetPath, entry.name)
      });
    }

    return;
  }

  if (!sourceStats.isFile()) {
    return;
  }

  const relativeTargetPath = toProjectRelativePath(options.projectRoot, options.targetPath);
  if (existsSync(options.targetPath)) {
    if (!options.force) {
      options.summary.filesSkipped.push(relativeTargetPath);
      return;
    }

    mkdirSync(dirname(options.targetPath), { recursive: true });
    copyFileSync(options.sourcePath, options.targetPath);
    options.summary.filesOverwritten.push(relativeTargetPath);
    return;
  }

  mkdirSync(dirname(options.targetPath), { recursive: true });
  copyFileSync(options.sourcePath, options.targetPath);
  options.summary.filesCopied.push(relativeTargetPath);
}

function resolveTiqoraRuntimeSourceDir(startDir?: string): string | null {
  const startDirs = getSearchRoots(startDir);

  for (const initialCursor of startDirs) {
    let cursor = initialCursor;

    for (let level = 0; level <= 6; level += 1) {
      const candidate = resolve(cursor, TIQORA_RUNTIME_ROOT);
      const workflowEngineCandidate = resolve(candidate, "core", "tasks", "workflow.xml");
      if (existsSync(workflowEngineCandidate)) {
        return candidate;
      }

      const parent = dirname(cursor);
      if (parent === cursor) {
        break;
      }

      cursor = parent;
    }
  }

  return null;
}

function getSearchRoots(startDir?: string): Set<string> {
  const startDirs = new Set<string>();

  // Prioritize the currently executed package (npx/.bin, installed CLI) first.
  addProcessEntrySearchRoots(startDirs);
  addModuleSearchRoots(startDirs);

  if (startDir) {
    startDirs.add(resolve(startDir));
  }
  startDirs.add(resolve(process.cwd()));

  return startDirs;
}

function addProcessEntrySearchRoots(startDirs: Set<string>): void {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return;
  }

  addPathAndParent(startDirs, resolve(entryPath));

  try {
    const realEntryPath = realpathSync(entryPath);
    addPathAndParent(startDirs, resolve(realEntryPath));
  } catch {
    // Ignore non-resolvable entry paths.
  }
}

function addModuleSearchRoots(startDirs: Set<string>): void {
  if (typeof __filename !== "string" || __filename.length === 0) {
    return;
  }

  addPathAndParent(startDirs, resolve(__filename));
}

function addPathAndParent(startDirs: Set<string>, path: string): void {
  const pathDir = dirname(path);
  startDirs.add(pathDir);
  startDirs.add(resolve(pathDir, ".."));
}

function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const relativePath = relative(projectRoot, absolutePath);
  if (relativePath.length === 0) {
    return ".";
  }

  return relativePath.replace(/\\/gu, "/");
}
