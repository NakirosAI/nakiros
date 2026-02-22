import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export const PROJECT_CONFIG_FILE = ".tiqora.yaml";
export const GLOBAL_CONFIG_FILE = ".tiqora/config.yaml";
export const MISSING_CONFIG_ERROR_MESSAGE =
  "✗ No .tiqora.yaml found. Run npx tiqora init first.";
export const DEFAULT_USER_NAME = "Developer";
export const DEFAULT_COMMUNICATION_LANGUAGE = "fr";
export const DEFAULT_DOCUMENT_LANGUAGE = "fr";

const REQUIRED_CONFIG_KEYS = [
  "pm_tool",
  "git_host",
  "branch_pattern"
] as const;

type RequiredConfigKey = (typeof REQUIRED_CONFIG_KEYS)[number];

export interface RuntimeConfig {
  user_name: string;
  pm_tool: string;
  git_host: string;
  branch_pattern: string;
  idle_threshold_minutes: number;
  communication_language: string;
  document_language: string;
}

export interface ConfigDiscoveryOptions {
  startDir?: string;
  maxParentLevels?: number;
  globalConfigPath?: string;
}

export interface ConfigExitOptions extends ConfigDiscoveryOptions {
  log?: (message: string) => void;
  exit?: (code: number) => never;
}

export class ConfigNotFoundError extends Error {
  readonly code = "CONFIG_NOT_FOUND";

  constructor(message = MISSING_CONFIG_ERROR_MESSAGE) {
    super(message);
    this.name = "ConfigNotFoundError";
  }
}

export function discoverProjectConfigPath(
  startDir = process.cwd(),
  maxParentLevels = 3
): string | null {
  let cursor = resolve(startDir);

  for (let level = 0; level <= maxParentLevels; level += 1) {
    const candidate = resolve(cursor, PROJECT_CONFIG_FILE);

    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }

    cursor = parent;
  }

  return null;
}

export function getGlobalConfigPath(): string {
  return resolve(homedir(), GLOBAL_CONFIG_FILE);
}

export function resolveConfigPath(options: ConfigDiscoveryOptions = {}): string | null {
  const projectConfig = discoverProjectConfigPath(
    options.startDir ?? process.cwd(),
    options.maxParentLevels ?? 3
  );

  if (projectConfig) {
    return projectConfig;
  }

  const globalPath = options.globalConfigPath ?? getGlobalConfigPath();

  if (existsSync(globalPath)) {
    return globalPath;
  }

  return null;
}

export function loadRuntimeConfig(options: ConfigDiscoveryOptions = {}): RuntimeConfig {
  const projectPath = discoverProjectConfigPath(
    options.startDir ?? process.cwd(),
    options.maxParentLevels ?? 3
  );
  const globalPath = options.globalConfigPath ?? getGlobalConfigPath();
  const hasGlobal = existsSync(globalPath);

  if (!projectPath && !hasGlobal) {
    throw new ConfigNotFoundError();
  }

  const projectValues = projectPath
    ? parseYamlFlatMap(readFileSync(projectPath, "utf8"))
    : {};
  const globalValues = hasGlobal
    ? parseYamlFlatMap(readFileSync(globalPath, "utf8"))
    : {};

  return parseAndValidateConfig(
    {
      ...globalValues,
      ...projectValues
    },
    projectPath ?? globalPath
  );
}

export function loadRuntimeConfigOrExit(options: ConfigExitOptions = {}): RuntimeConfig {
  try {
    return loadRuntimeConfig(options);
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      const log = options.log ?? console.error;
      const exit = options.exit ?? process.exit;

      log(MISSING_CONFIG_ERROR_MESSAGE);
      return exit(1);
    }

    throw error;
  }
}

function parseAndValidateConfig(
  parsed: Record<string, string>,
  configPath: string
): RuntimeConfig {
  const missingKey = REQUIRED_CONFIG_KEYS.find((key) => !(key in parsed));

  if (missingKey) {
    throw new Error(`Missing required key "${missingKey}" in ${configPath}`);
  }

  const idleThreshold = Number(parsed.idle_threshold_minutes ?? "15");
  if (!Number.isFinite(idleThreshold) || idleThreshold <= 0) {
    throw new Error(`Invalid idle_threshold_minutes in ${configPath}`);
  }

  return {
    user_name: parseOptionalRequiredValue(parsed.user_name, DEFAULT_USER_NAME),
    pm_tool: String(parsed.pm_tool),
    git_host: String(parsed.git_host),
    branch_pattern: String(parsed.branch_pattern),
    idle_threshold_minutes: idleThreshold,
    communication_language: parseOptionalLanguage(
      parsed.communication_language,
      DEFAULT_COMMUNICATION_LANGUAGE
    ),
    document_language: parseOptionalLanguage(
      parsed.document_language,
      DEFAULT_DOCUMENT_LANGUAGE
    )
  };
}

function parseYamlFlatMap(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    result[key] = stripWrappingQuotes(rawValue);
  }

  return result;
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const startsWithSingle = value.startsWith("'");
  const startsWithDouble = value.startsWith('"');

  if (startsWithSingle && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  if (startsWithDouble && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function parseOptionalLanguage(value: string | undefined, fallback: string): string {
  return parseOptionalRequiredValue(value, fallback);
}

function parseOptionalRequiredValue(value: string | undefined, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? fallback : normalized;
}
