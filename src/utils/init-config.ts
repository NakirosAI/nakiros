import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export type InitPmTool = "jira" | "gitlab" | "none";
export type InitGitHost = "gitlab" | "github";

export interface JiraWizardAnswers {
  projectKey: string;
  boardId: string;
}

export interface InitWizardAnswers {
  pmTool: InitPmTool;
  gitHost: InitGitHost;
  branchPattern: string;
  idleThresholdMinutes?: number;
  userName?: string;
  communicationLanguage?: string;
  documentLanguage?: string;
  jira?: JiraWizardAnswers;
}

export interface WriteProjectInitConfigOptions {
  projectRoot?: string;
  answers: InitWizardAnswers;
  allowOverwrite?: boolean;
}

export interface WriteGlobalUserConfigOptions {
  homeDir?: string;
  answers: InitWizardAnswers;
}

export interface ExistingInitConfig {
  pmTool?: InitPmTool;
  gitHost?: InitGitHost;
  branchPattern?: string;
  idleThresholdMinutes?: number;
  userName?: string;
  communicationLanguage?: string;
  documentLanguage?: string;
  jira?: JiraWizardAnswers;
}

export const DEFAULT_IDLE_THRESHOLD_MINUTES = 15;
export const DEFAULT_USER_NAME = "Developer";
export const DEFAULT_COMMUNICATION_LANGUAGE = "fr";
export const DEFAULT_DOCUMENT_LANGUAGE = "fr";
export const PROJECT_INIT_CONFIG_FILE = ".tiqora.yaml";
export const GLOBAL_USER_CONFIG_FILE = ".tiqora/config.yaml";

// Backward-compatible alias kept for tests and existing callers.
export function createInitConfigYaml(answers: InitWizardAnswers): string {
  return createProjectInitConfigYaml(answers);
}

export function createProjectInitConfigYaml(answers: InitWizardAnswers): string {
  const branchPattern = answers.branchPattern.trim();
  if (branchPattern.length === 0) {
    throw new Error("Branch pattern cannot be empty.");
  }

  const lines = [
    `pm_tool: ${answers.pmTool}`,
    `git_host: ${answers.gitHost}`,
    `branch_pattern: '${escapeSingleQuotes(branchPattern)}'`
  ];

  if (answers.pmTool === "jira") {
    const jira = answers.jira;
    if (!jira) {
      throw new Error("Jira configuration is required when pm_tool is jira.");
    }

    const projectKey = jira.projectKey.trim();
    const boardId = jira.boardId.trim();
    if (!projectKey || !boardId) {
      throw new Error("jira.project_key and jira.board_id are required.");
    }

    lines.push("jira:");
    lines.push(`  project_key: ${projectKey}`);
    lines.push(`  board_id: '${escapeSingleQuotes(boardId)}'`);
  }

  return `${lines.join("\n")}\n`;
}

export function createGlobalUserConfigYaml(answers: InitWizardAnswers): string {
  const idleThresholdMinutes =
    answers.idleThresholdMinutes ?? DEFAULT_IDLE_THRESHOLD_MINUTES;
  if (!Number.isInteger(idleThresholdMinutes) || idleThresholdMinutes <= 0) {
    throw new Error("idle_threshold_minutes must be a positive integer.");
  }

  const userName = normalizeRequiredValue(
    answers.userName ?? DEFAULT_USER_NAME,
    "user_name"
  );
  const communicationLanguage = normalizeLanguageValue(
    answers.communicationLanguage ?? DEFAULT_COMMUNICATION_LANGUAGE,
    "communication_language"
  );
  const documentLanguage = normalizeLanguageValue(
    answers.documentLanguage ?? DEFAULT_DOCUMENT_LANGUAGE,
    "document_language"
  );

  return [
    `user_name: '${escapeSingleQuotes(userName)}'`,
    `idle_threshold_minutes: ${idleThresholdMinutes}`,
    `communication_language: '${escapeSingleQuotes(communicationLanguage)}'`,
    `document_language: '${escapeSingleQuotes(documentLanguage)}'`,
    ""
  ].join("\n");
}

export function writeProjectInitConfig(
  options: WriteProjectInitConfigOptions
): string {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const configPath = resolve(projectRoot, PROJECT_INIT_CONFIG_FILE);
  const allowOverwrite = options.allowOverwrite ?? false;
  if (existsSync(configPath) && !allowOverwrite) {
    throw new Error(
      `${PROJECT_INIT_CONFIG_FILE} already exists at ${configPath}. Remove it before running init.`
    );
  }

  const content = createProjectInitConfigYaml(options.answers);
  writeFileSync(configPath, content, "utf8");
  return configPath;
}

export function writeGlobalUserConfig(
  options: WriteGlobalUserConfigOptions
): string {
  const home = resolve(options.homeDir ?? homedir());
  const configPath = resolve(home, GLOBAL_USER_CONFIG_FILE);
  mkdirSync(resolve(home, ".tiqora"), { recursive: true });

  const content = createGlobalUserConfigYaml(options.answers);
  writeFileSync(configPath, content, "utf8");
  return configPath;
}

export function readExistingInitConfig(
  options: { projectRoot?: string; homeDir?: string } = {}
): ExistingInitConfig | null {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const projectConfigPath = resolve(projectRoot, PROJECT_INIT_CONFIG_FILE);
  const home = resolve(options.homeDir ?? homedir());
  const globalConfigPath = resolve(home, GLOBAL_USER_CONFIG_FILE);

  if (!existsSync(projectConfigPath) && !existsSync(globalConfigPath)) {
    return null;
  }

  const result: ExistingInitConfig = {};
  const mergeFrom = (path: string) => {
    if (!existsSync(path)) {
      return;
    }
    const parsed = parseExistingInitConfigFile(path);
    Object.assign(result, parsed);
  };

  // Priority: global defaults, then project-specific overrides.
  mergeFrom(globalConfigPath);
  mergeFrom(projectConfigPath);

  return result;
}

function parseExistingInitConfigFile(configPath: string): ExistingInitConfig {
  const content = readFileSync(configPath, "utf8");
  const lines = content.split(/\r?\n/u);
  const result: ExistingInitConfig = {};

  let inJiraBlock = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line === "jira:") {
      inJiraBlock = true;
      continue;
    }

    if (!rawLine.startsWith(" ") && !rawLine.startsWith("\t")) {
      inJiraBlock = false;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());

    if (!inJiraBlock) {
      if (key === "pm_tool" && isInitPmTool(value)) {
        result.pmTool = value;
      } else if (key === "git_host" && isInitGitHost(value)) {
        result.gitHost = value;
      } else if (key === "branch_pattern" && value.length > 0) {
        result.branchPattern = value;
      } else if (key === "idle_threshold_minutes") {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0) {
          result.idleThresholdMinutes = parsed;
        }
      } else if (key === "user_name" && value.length > 0) {
        result.userName = value;
      } else if (key === "communication_language" && value.length > 0) {
        result.communicationLanguage = value;
      } else if (key === "document_language" && value.length > 0) {
        result.documentLanguage = value;
      }
      continue;
    }

    if (key === "project_key" && value.length > 0) {
      result.jira = {
        projectKey: value,
        boardId: result.jira?.boardId ?? ""
      };
    } else if (key === "board_id" && value.length > 0) {
      result.jira = {
        projectKey: result.jira?.projectKey ?? "",
        boardId: value
      };
    }
  }

  if (
    result.jira &&
    (result.jira.projectKey.length === 0 || result.jira.boardId.length === 0)
  ) {
    delete result.jira;
  }

  return result;
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/gu, "''");
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("\"") && value.endsWith("\""))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeLanguageValue(value: string, key: string): string {
  return normalizeRequiredValue(value, key);
}

function normalizeRequiredValue(value: string, key: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${key} cannot be empty.`);
  }

  return normalized;
}

function isInitPmTool(value: string): value is InitPmTool {
  return value === "jira" || value === "gitlab" || value === "none";
}

function isInitGitHost(value: string): value is InitGitHost {
  return value === "gitlab" || value === "github";
}
