import { accessSync, existsSync, mkdirSync, readdirSync, statSync, constants } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { cancel, isCancel, multiselect, select, text } from "@clack/prompts";

export type EnvironmentId = "claude-code" | "codex" | "cursor";
export type DiscoverySource = "project" | "home";

export interface EnvironmentCandidate {
  envId: EnvironmentId;
  label: string;
  targetPath: string;
  source: DiscoverySource;
}

export interface SelectedEnvironment {
  envId: EnvironmentId | "manual";
  label: string;
  targetPath: string;
  source: DiscoverySource | "manual";
}

export interface DetectionOptions {
  cwd?: string;
  homeDir?: string;
}

export interface ResolveEnvironmentTargetOptions extends DetectionOptions {
  allowMultipleSelections?: boolean;
  selectEnvironment?: (candidates: EnvironmentCandidate[]) => Promise<string | null>;
  selectEnvironments?: (candidates: EnvironmentCandidate[]) => Promise<string[] | null>;
  promptManualPath?: () => Promise<string | null>;
  validateTargetPath?: (targetPath: string) => void;
  manualPathBaseDir?: string;
}

export interface EnvironmentTargetResolution {
  detected: EnvironmentCandidate[];
  selectedTargets: SelectedEnvironment[];
  selected: SelectedEnvironment;
  needsManualPath: boolean;
}

interface EnvironmentProbe {
  envId: EnvironmentId;
  label: string;
  targetRelativePath: string;
  indicatorRelativePaths: string[];
}

const ENVIRONMENT_PROBES: EnvironmentProbe[] = [
  {
    envId: "claude-code",
    label: "Claude Code",
    targetRelativePath: ".claude/commands",
    indicatorRelativePaths: [".claude/commands", ".claude"]
  },
  {
    envId: "codex",
    label: "Codex",
    targetRelativePath: ".codex/prompts",
    indicatorRelativePaths: [".codex/prompts", ".codex"]
  },
  {
    envId: "cursor",
    label: "Cursor",
    targetRelativePath: ".cursor/commands",
    indicatorRelativePaths: [".cursor/commands", ".cursor"]
  }
];

const SOURCE_ORDER: DiscoverySource[] = ["project", "home"];
const INSTALLED_COMMAND_FILES = [
  "tiq-agent-dev.md",
  "tiq-agent-sm.md",
  "tiq-agent-pm.md",
  "tiq-workflow-create-story.md",
  "tiq-workflow-dev-story.md",
  "tiq-workflow-fetch-project-context.md",
  "tiq-workflow-create-ticket.md"
] as const;

export function detectEnvironmentCandidates(options: DetectionOptions = {}): EnvironmentCandidate[] {
  const cwd = resolve(options.cwd ?? process.cwd());
  const homeDir = resolve(options.homeDir ?? homedir());

  const candidates: EnvironmentCandidate[] = [];

  for (const source of SOURCE_ORDER) {
    const sourceRoot = source === "project" ? cwd : homeDir;

    for (const probe of ENVIRONMENT_PROBES) {
      const hasIndicator = probe.indicatorRelativePaths.some((indicatorPath) =>
        isExistingDirectory(resolve(sourceRoot, indicatorPath))
      );

      if (hasIndicator) {
        const targetPath = resolve(sourceRoot, probe.targetRelativePath);
        if (!isCreatableDirectoryTarget(targetPath)) {
          continue;
        }

        candidates.push({
          envId: probe.envId,
          label: probe.label,
          targetPath,
          source
        });
      }
    }
  }

  return candidates;
}

export async function resolveEnvironmentTarget(
  options: ResolveEnvironmentTargetOptions = {}
): Promise<EnvironmentTargetResolution> {
  const detected = detectEnvironmentCandidates(options);
  const allowMultipleSelections = options.allowMultipleSelections ?? false;

  if (detected.length === 1) {
    const selected = toSelectedEnvironment(detected[0]);
    return {
      detected,
      selectedTargets: [selected],
      selected,
      needsManualPath: false
    };
  }

  if (detected.length > 1) {
    if (allowMultipleSelections) {
      const selectEnvironments = options.selectEnvironments ?? defaultSelectEnvironments;
      const selectedKeys = await selectEnvironments(detected);

      if (!selectedKeys || selectedKeys.length === 0) {
        throw new Error("Environment selection was cancelled.");
      }

      const selectedTargets = detected
        .filter((candidate) => selectedKeys.includes(candidateKey(candidate)))
        .map(toSelectedEnvironment);

      if (selectedTargets.length === 0) {
        throw new Error("Selected environments do not match detected candidates.");
      }

      return {
        detected,
        selectedTargets,
        selected: selectedTargets[0],
        needsManualPath: false
      };
    }

    const selectEnvironment = options.selectEnvironment ?? defaultSelectEnvironment;
    const selectedKey = await selectEnvironment(detected);

    if (!selectedKey) {
      throw new Error("Environment selection was cancelled.");
    }

    const selectedCandidate = detected.find((candidate) => candidateKey(candidate) === selectedKey);
    if (!selectedCandidate) {
      throw new Error(`Selected environment does not match detected candidates: ${selectedKey}`);
    }

    const selected = toSelectedEnvironment(selectedCandidate);
    return {
      detected,
      selectedTargets: [selected],
      selected,
      needsManualPath: false
    };
  }

  const promptManualPath = options.promptManualPath ?? defaultManualPathPrompt;
  const manualInput = await promptManualPath();
  if (!manualInput) {
    throw new Error("Manual deployment path prompt was cancelled.");
  }

  const normalizedPath = normalizeManualTargetPath(manualInput, {
    baseDir: options.manualPathBaseDir ?? options.cwd ?? process.cwd()
  });
  const validateTargetPath = options.validateTargetPath ?? validateDeploymentTargetPath;
  validateTargetPath(normalizedPath);

  const selected: SelectedEnvironment = {
    envId: "manual",
    label: "Manual path",
    targetPath: normalizedPath,
    source: "manual"
  };

  return {
    detected,
    selectedTargets: [selected],
    selected,
    needsManualPath: true
  };
}

export function normalizeManualTargetPath(
  inputPath: string,
  options: { baseDir?: string } = {}
): string {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    throw new Error("Manual deployment path cannot be empty.");
  }

  const baseDir = resolve(options.baseDir ?? process.cwd());
  return resolve(baseDir, trimmed);
}

export function validateDeploymentTargetPath(targetPath: string): void {
  if (existsSync(targetPath)) {
    const stats = statSync(targetPath);
    if (!stats.isDirectory()) {
      throw new Error(`Deployment target is not a directory: ${targetPath}`);
    }
  } else {
    mkdirSync(targetPath, { recursive: true });
  }

  accessSync(targetPath, constants.W_OK);
}

function candidateKey(candidate: EnvironmentCandidate): string {
  return `${candidate.source}:${candidate.envId}`;
}

function toSelectedEnvironment(candidate: EnvironmentCandidate): SelectedEnvironment {
  return {
    envId: candidate.envId,
    label: candidate.label,
    targetPath: candidate.targetPath,
    source: candidate.source
  };
}

async function defaultSelectEnvironment(candidates: EnvironmentCandidate[]): Promise<string | null> {
  const answer = await select({
    message: "Multiple AI environments detected. Choose deployment target:",
    options: candidates.map((candidate) => ({
      value: candidateKey(candidate),
      label: `${candidate.label} (${candidate.source})`,
      hint: candidate.targetPath
    }))
  });

  if (isCancel(answer)) {
    cancel("Operation cancelled.");
    return null;
  }

  return String(answer);
}

async function defaultSelectEnvironments(candidates: EnvironmentCandidate[]): Promise<string[] | null> {
  const initialValues = getDefaultSelectedEnvironmentKeys(candidates);

  const answer = await multiselect({
    message: "Multiple AI environments detected. Choose deployment targets:",
    initialValues,
    options: candidates.map((candidate) => ({
      value: candidateKey(candidate),
      label: `${candidate.label} (${candidate.source})`,
      hint: candidate.targetPath
    }))
  });

  if (isCancel(answer)) {
    cancel("Operation cancelled.");
    return null;
  }

  return Array.from(answer).map((value) => String(value));
}

export function getDefaultSelectedEnvironmentKeys(
  candidates: EnvironmentCandidate[]
): string[] {
  return candidates
    .filter(
      (candidate) =>
        hasInstalledCommandFiles(candidate.targetPath) ||
        hasAnyTiqCommandFiles(candidate.targetPath)
    )
    .map(candidateKey);
}

async function defaultManualPathPrompt(): Promise<string | null> {
  const answer = await text({
    message: "No known AI environment found. Enter deployment directory:"
  });

  if (isCancel(answer)) {
    cancel("Operation cancelled.");
    return null;
  }

  return String(answer);
}

function isExistingDirectory(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }

  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isCreatableDirectoryTarget(path: string): boolean {
  if (!existsSync(path)) {
    return true;
  }

  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasInstalledCommandFiles(targetPath: string): boolean {
  return INSTALLED_COMMAND_FILES.every((fileName) =>
    existsSync(resolve(targetPath, fileName))
  );
}

function hasAnyTiqCommandFiles(targetPath: string): boolean {
  try {
    const entries = readdirSync(targetPath, { withFileTypes: true });
    return entries.some(
      (entry) => entry.isFile() && /^tiq-[a-z0-9-]+\.md$/iu.test(entry.name)
    );
  } catch {
    return false;
  }
}
