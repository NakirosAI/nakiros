import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  discoverProjectConfigPath,
  loadRuntimeConfig,
  PROJECT_CONFIG_FILE
} from "../../src/utils/config.js";

const BASE_CONFIG = [
  "pm_tool: jira",
  "git_host: gitlab",
  "branch_pattern: feature/*",
  "idle_threshold_minutes: 15"
].join("\n");

describe("config discovery utilities", () => {
  it("finds config in current working directory first", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-config-unit-"));
    const cwd = resolve(sandbox, "repo", "apps", "web");
    mkdirSync(cwd, { recursive: true });

    const currentConfig = resolve(cwd, PROJECT_CONFIG_FILE);
    const globalConfigPath = resolve(sandbox, ".tiqora", "config.yaml");
    writeFileSync(currentConfig, BASE_CONFIG, "utf8");

    const foundPath = discoverProjectConfigPath(cwd, 3);
    expect(foundPath).toBe(currentConfig);

    const config = loadRuntimeConfig({ startDir: cwd, globalConfigPath });
    expect(config).toEqual({
      user_name: "Developer",
      pm_tool: "jira",
      git_host: "gitlab",
      branch_pattern: "feature/*",
      idle_threshold_minutes: 15,
      communication_language: "fr",
      document_language: "fr"
    });

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("walks parent directories up to 3 levels", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-config-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    const nestedDir = resolve(repoRoot, "apps", "api", "handlers");
    mkdirSync(nestedDir, { recursive: true });

    const repoConfig = resolve(repoRoot, PROJECT_CONFIG_FILE);
    const globalConfigPath = resolve(sandbox, ".tiqora", "config.yaml");
    writeFileSync(repoConfig, BASE_CONFIG, "utf8");

    const foundPath = discoverProjectConfigPath(nestedDir, 3);
    expect(foundPath).toBe(repoConfig);
    const config = loadRuntimeConfig({ startDir: nestedDir, globalConfigPath });
    expect(config.idle_threshold_minutes).toBe(15);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("uses first-match precedence when multiple configs are present", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-config-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    const nestedDir = resolve(repoRoot, "apps", "web");
    mkdirSync(nestedDir, { recursive: true });

    const parentConfig = resolve(repoRoot, PROJECT_CONFIG_FILE);
    const nestedConfig = resolve(nestedDir, PROJECT_CONFIG_FILE);
    const globalConfigPath = resolve(sandbox, ".tiqora", "config.yaml");

    writeFileSync(parentConfig, BASE_CONFIG, "utf8");
    writeFileSync(
      nestedConfig,
      [
        "pm_tool: linear",
        "user_name: Alice",
        "git_host: github",
        "branch_pattern: feat/*",
        "idle_threshold_minutes: 20",
        "communication_language: en",
        "document_language: de"
      ].join("\n"),
      "utf8"
    );

    const foundPath = discoverProjectConfigPath(nestedDir, 3);
    expect(foundPath).toBe(nestedConfig);

    const config = loadRuntimeConfig({ startDir: nestedDir, globalConfigPath });
    expect(config.user_name).toBe("Alice");
    expect(config.pm_tool).toBe("linear");
    expect(config.communication_language).toBe("en");
    expect(config.document_language).toBe("de");

    rmSync(sandbox, { recursive: true, force: true });
  });
});
