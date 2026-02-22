import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadRuntimeConfig,
  loadRuntimeConfigOrExit,
  MISSING_CONFIG_ERROR_MESSAGE,
  PROJECT_CONFIG_FILE
} from "../../src/utils/config.js";

const GLOBAL_CONFIG_CONTENT = [
  "pm_tool: jira",
  "git_host: gitlab",
  "branch_pattern: feature/*",
  "idle_threshold_minutes: 10"
].join("\n");

describe("integration: config discovery chain", () => {
  it("resolves repo -> parent -> global in order", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-config-int-"));
    const parentDir = resolve(sandbox, "workspace");
    const repoDir = resolve(parentDir, "repo");
    const startDir = resolve(repoDir, "packages", "cli");
    const globalConfigPath = resolve(sandbox, ".tiqora", "config.yaml");

    mkdirSync(startDir, { recursive: true });
    mkdirSync(resolve(sandbox, ".tiqora"), { recursive: true });

    writeFileSync(globalConfigPath, GLOBAL_CONFIG_CONTENT, "utf8");

    writeFileSync(
      resolve(parentDir, PROJECT_CONFIG_FILE),
      [
        "pm_tool: linear",
        "user_name: Parent User",
        "git_host: github",
        "branch_pattern: chore/*",
        "idle_threshold_minutes: 25"
      ].join("\n"),
      "utf8"
    );

    writeFileSync(
      resolve(repoDir, PROJECT_CONFIG_FILE),
      [
        "pm_tool: azure",
        "user_name: Repo User",
        "git_host: bitbucket",
        "branch_pattern: story/*",
        "idle_threshold_minutes: 30"
      ].join("\n"),
      "utf8"
    );

    const repoWinner = loadRuntimeConfig({
      startDir,
      globalConfigPath
    });
    expect(repoWinner.pm_tool).toBe("azure");
    expect(repoWinner.user_name).toBe("Repo User");
    expect(repoWinner.idle_threshold_minutes).toBe(30);
    expect(repoWinner.communication_language).toBe("Français");
    expect(repoWinner.document_language).toBe("English");

    rmSync(resolve(repoDir, PROJECT_CONFIG_FILE));
    const parentWinner = loadRuntimeConfig({
      startDir,
      globalConfigPath
    });
    expect(parentWinner.pm_tool).toBe("linear");
    expect(parentWinner.user_name).toBe("Parent User");
    expect(parentWinner.branch_pattern).toBe("chore/*");
    expect(parentWinner.communication_language).toBe("Français");
    expect(parentWinner.document_language).toBe("English");

    rmSync(resolve(parentDir, PROJECT_CONFIG_FILE));
    const globalWinner = loadRuntimeConfig({
      startDir,
      globalConfigPath
    });
    expect(globalWinner.pm_tool).toBe("jira");
    expect(globalWinner.user_name).toBe("Developer");
    expect(globalWinner.git_host).toBe("gitlab");
    expect(globalWinner.communication_language).toBe("Français");
    expect(globalWinner.document_language).toBe("English");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("logs the exact missing-config message and exits with code 1", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-config-int-"));
    const startDir = resolve(sandbox, "repo", "apps", "web");
    const globalConfigPath = resolve(sandbox, ".tiqora", "config.yaml");
    mkdirSync(startDir, { recursive: true });

    const logs: string[] = [];

    class ExitSignal extends Error {
      constructor(readonly code: number) {
        super(`Exit ${code}`);
      }
    }

    const exit = ((code: number): never => {
      throw new ExitSignal(code);
    }) as (code: number) => never;

    expect(() =>
      loadRuntimeConfigOrExit({
        startDir,
        globalConfigPath,
        log: (message) => logs.push(message),
        exit
      })
    ).toThrowError(ExitSignal);

    try {
      loadRuntimeConfigOrExit({
        startDir,
        globalConfigPath,
        log: (message) => logs.push(message),
        exit
      });
    } catch (error) {
      if (error instanceof ExitSignal) {
        expect(error.code).toBe(1);
      } else {
        throw error;
      }
    }

    expect(logs[0]).toBe(MISSING_CONFIG_ERROR_MESSAGE);
    rmSync(sandbox, { recursive: true, force: true });
  });
});
