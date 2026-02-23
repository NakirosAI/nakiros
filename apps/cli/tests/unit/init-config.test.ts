import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createGlobalUserConfigYaml,
  createInitConfigYaml,
  GLOBAL_USER_CONFIG_FILE,
  readExistingInitConfig,
  writeGlobalUserConfig,
  writeProjectInitConfig
} from "../../src/utils/init-config.js";

describe("unit: init-config", () => {
  it("generates deterministic yaml with jira block when pm tool is jira", () => {
    const yaml = createInitConfigYaml({
      pmTool: "jira",
      gitHost: "gitlab",
      branchPattern: "story/*",
      jira: {
        projectKey: "PROJ",
        boardId: "123"
      }
    });

    expect(yaml).toContain("pm_tool: jira");
    expect(yaml).toContain("git_host: gitlab");
    expect(yaml).toContain("branch_pattern: 'story/*'");
    expect(yaml).not.toContain("user_name:");
    expect(yaml).not.toContain("idle_threshold_minutes:");
    expect(yaml).not.toContain("communication_language:");
    expect(yaml).toContain("document_language: 'English'");
    expect(yaml).toContain("jira:");
    expect(yaml).toContain("project_key: PROJ");
    expect(yaml).toContain("board_id: '123'");
  });

  it("omits jira block when pm tool is not jira", () => {
    const yaml = createInitConfigYaml({
      pmTool: "none",
      gitHost: "github",
      branchPattern: "feature/*"
    });

    expect(yaml).toContain("pm_tool: none");
    expect(yaml).toContain("git_host: github");
    expect(yaml).toContain("branch_pattern: 'feature/*'");
    expect(yaml).not.toContain("user_name:");
    expect(yaml).not.toContain("communication_language:");
    expect(yaml).toContain("document_language: 'English'");
    expect(yaml).not.toContain("\njira:\n");
  });

  it("generates deterministic global user config yaml", () => {
    const yaml = createGlobalUserConfigYaml({
      pmTool: "none",
      gitHost: "github",
      branchPattern: "feature/*",
      userName: "Thomas Ailleaume",
      communicationLanguage: "Français",
      documentLanguage: "English",
      idleThresholdMinutes: 15
    });

    expect(yaml).toContain("user_name: 'Thomas Ailleaume'");
    expect(yaml).toContain("idle_threshold_minutes: 15");
    expect(yaml).toContain("communication_language: 'Français'");
    expect(yaml).not.toContain("document_language:");
  });

  it("writes .tiqora.yaml when file does not exist", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-config-"));
    const configPath = writeProjectInitConfig({
      projectRoot: sandbox,
      answers: {
        pmTool: "none",
        gitHost: "github",
        branchPattern: "feature/*"
      }
    });

    expect(configPath).toBe(resolve(sandbox, ".tiqora.yaml"));
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf8")).toContain("pm_tool: none");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("fails fast when .tiqora.yaml already exists", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-config-"));
    const configPath = resolve(sandbox, ".tiqora.yaml");
    writeFileSync(configPath, "pm_tool: none\n", "utf8");

    expect(() =>
      writeProjectInitConfig({
        projectRoot: sandbox,
        answers: {
          pmTool: "none",
          gitHost: "github",
          branchPattern: "feature/*"
        }
      })
    ).toThrow(/already exists/u);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("parses existing config values for wizard prefill", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-config-"));
    const homeDir = resolve(sandbox, "home");
    const globalConfigPath = resolve(homeDir, GLOBAL_USER_CONFIG_FILE);
    mkdirSync(resolve(homeDir, ".tiqora"), { recursive: true });
    writeFileSync(
      globalConfigPath,
      [
        "user_name: 'Thomas'",
        "idle_threshold_minutes: 25",
        "communication_language: 'en'"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      resolve(sandbox, ".tiqora.yaml"),
      [
        "pm_tool: jira",
        "git_host: gitlab",
        "branch_pattern: 'feature/*'",
        "document_language: 'fr'",
        "jira:",
        "  project_key: PROJ",
        "  board_id: '42'"
      ].join("\n"),
      "utf8"
    );

    const existing = readExistingInitConfig({ projectRoot: sandbox, homeDir });
    expect(existing).toMatchObject({
      pmTool: "jira",
      userName: "Thomas",
      gitHost: "gitlab",
      branchPattern: "feature/*",
      idleThresholdMinutes: 25,
      communicationLanguage: "en",
      documentLanguage: "fr",
      jira: {
        projectKey: "PROJ",
        boardId: "42"
      }
    });

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("allows overwrite when explicitly requested", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-config-"));
    const configPath = resolve(sandbox, ".tiqora.yaml");
    writeFileSync(configPath, "pm_tool: none\n", "utf8");

    writeProjectInitConfig({
      projectRoot: sandbox,
      allowOverwrite: true,
      answers: {
        pmTool: "none",
        gitHost: "github",
        branchPattern: "feature/*"
      }
    });

    expect(readFileSync(configPath, "utf8")).toContain("git_host: github");
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("writes global user config under home .tiqora/config.yaml", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-config-"));
    const homeDir = resolve(sandbox, "home");

    const configPath = writeGlobalUserConfig({
      homeDir,
      answers: {
        pmTool: "none",
        gitHost: "github",
        branchPattern: "feature/*",
        userName: "Alice",
        communicationLanguage: "fr",
        documentLanguage: "en",
        idleThresholdMinutes: 20
      }
    });

    expect(configPath).toBe(resolve(homeDir, ".tiqora", "config.yaml"));
    expect(readFileSync(configPath, "utf8")).toContain("user_name: 'Alice'");
    expect(readFileSync(configPath, "utf8")).toContain("idle_threshold_minutes: 20");
    expect(readFileSync(configPath, "utf8")).not.toContain("document_language:");
    rmSync(sandbox, { recursive: true, force: true });
  });
});
