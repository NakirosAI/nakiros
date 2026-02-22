import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  detectEnvironmentCandidates,
  getDefaultSelectedEnvironmentKeys,
  normalizeManualTargetPath,
  resolveEnvironmentTarget,
  validateDeploymentTargetPath
} from "../../src/utils/env-detect.js";
import { COMMAND_TEMPLATE_FILES } from "../../src/utils/file-ops.js";

const COMMAND_FILES = COMMAND_TEMPLATE_FILES;

function writeInstalledCommands(targetPath: string): void {
  mkdirSync(targetPath, { recursive: true });

  for (const fileName of COMMAND_FILES) {
    writeFileSync(resolve(targetPath, fileName), `cmd:${fileName}\n`, "utf8");
  }
}

describe("environment detection utility", () => {
  it("detects Claude Code in project scope", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      envId: "claude-code",
      source: "project",
      targetPath: resolve(cwd, ".claude", "commands")
    });

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("detects Cursor in home scope", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(resolve(homeDir, ".cursor"), { recursive: true });

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      envId: "cursor",
      source: "home",
      targetPath: resolve(homeDir, ".cursor", "commands")
    });

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("detects Codex in home scope", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(resolve(homeDir, ".codex"), { recursive: true });

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      envId: "codex",
      source: "home",
      targetPath: resolve(homeDir, ".codex", "prompts")
    });

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("returns deterministic ordering including project and home candidates", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");

    mkdirSync(resolve(cwd, ".cursor", "commands"), { recursive: true });
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(resolve(cwd, ".codex"), { recursive: true });
    mkdirSync(resolve(homeDir, ".cursor"), { recursive: true });
    mkdirSync(resolve(homeDir, ".claude"), { recursive: true });
    mkdirSync(resolve(homeDir, ".codex"), { recursive: true });

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    expect(candidates.map((candidate) => `${candidate.source}:${candidate.envId}`)).toEqual([
      "project:claude-code",
      "project:codex",
      "project:cursor",
      "home:claude-code",
      "home:codex",
      "home:cursor"
    ]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("keeps home candidates when project does not expose that environment", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");

    mkdirSync(resolve(cwd, ".cursor", "commands"), { recursive: true });
    mkdirSync(resolve(homeDir, ".codex"), { recursive: true });
    mkdirSync(resolve(homeDir, ".claude"), { recursive: true });

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    expect(candidates.map((candidate) => `${candidate.source}:${candidate.envId}`)).toEqual([
      "project:cursor",
      "home:claude-code",
      "home:codex"
    ]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("preselects candidates with complete install or existing tiq command files", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");

    const projectClaude = resolve(cwd, ".claude", "commands");
    const projectCursor = resolve(cwd, ".cursor", "commands");
    const homeCodex = resolve(homeDir, ".codex", "prompts");

    writeInstalledCommands(projectClaude);
    mkdirSync(projectCursor, { recursive: true });
    mkdirSync(homeCodex, { recursive: true });
    writeFileSync(resolve(homeCodex, COMMAND_FILES[0]), "partial\n", "utf8");

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    const selected = getDefaultSelectedEnvironmentKeys(candidates);

    expect(selected).toEqual(["project:claude-code", "home:codex"]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("does not preselect candidates without tiq command files", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");

    const homeCodex = resolve(homeDir, ".codex", "prompts");
    mkdirSync(homeCodex, { recursive: true });
    writeFileSync(resolve(homeCodex, "legacy-something.md"), "legacy\n", "utf8");

    const candidates = detectEnvironmentCandidates({ cwd, homeDir });
    const selected = getDefaultSelectedEnvironmentKeys(candidates);

    expect(selected).toEqual([]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("requires manual path when nothing is detected", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const result = await resolveEnvironmentTarget({
      cwd,
      homeDir,
      promptManualPath: async () => resolve(cwd, ".custom", "commands")
    });

    expect(result.detected).toEqual([]);
    expect(result.needsManualPath).toBe(true);
    expect(result.selected).toMatchObject({
      envId: "manual",
      source: "manual",
      targetPath: resolve(cwd, ".custom", "commands")
    });

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("allows multi-selection when multiple environments are detected", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude"), { recursive: true });
    mkdirSync(resolve(cwd, ".cursor"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const result = await resolveEnvironmentTarget({
      cwd,
      homeDir,
      allowMultipleSelections: true,
      selectEnvironments: async () => ["project:claude-code", "project:cursor"]
    });

    expect(result.selectedTargets.map((entry) => entry.envId)).toEqual(["claude-code", "cursor"]);
    expect(result.selected.envId).toBe("claude-code");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("normalizes relative manual paths and rejects empty input", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const baseDir = resolve(sandbox, "repo");
    mkdirSync(baseDir, { recursive: true });

    expect(normalizeManualTargetPath("commands/custom", { baseDir })).toBe(
      resolve(baseDir, "commands", "custom")
    );

    expect(() => normalizeManualTargetPath("   ", { baseDir })).toThrowError(
      "Manual deployment path cannot be empty."
    );

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("validates manual path is a writable directory", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-unit-"));
    const directoryTarget = resolve(sandbox, "manual-target");
    const fileTarget = resolve(sandbox, "not-a-dir");

    mkdirSync(directoryTarget, { recursive: true });
    expect(() => validateDeploymentTargetPath(directoryTarget)).not.toThrow();

    expect(() => validateDeploymentTargetPath(resolve(sandbox, "nested", "new-target"))).not.toThrow();

    writeFileSync(fileTarget, "not a directory", "utf8");
    expect(() => validateDeploymentTargetPath(fileTarget)).toThrowError(
      `Deployment target is not a directory: ${fileTarget}`
    );

    rmSync(sandbox, { recursive: true, force: true });
  });
});
