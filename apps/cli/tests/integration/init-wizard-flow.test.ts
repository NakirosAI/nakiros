import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { runInitCommand } from "../../src/commands/init.js";
import { COMMAND_TEMPLATE_FILES } from "../../src/utils/file-ops.js";

const COMMAND_FILES = COMMAND_TEMPLATE_FILES;
const PRIMARY_COMMAND_FILE = COMMAND_FILES[0];
const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

function writeTemplateSet(templateDir: string): void {
  mkdirSync(templateDir, { recursive: true });

  for (const fileName of COMMAND_FILES) {
    writeFileSync(resolve(templateDir, fileName), `template:${fileName}\n`, "utf8");
  }
}

function writeClaudeJiraMcpConfig(homeDir: string, projectRoot: string): void {
  writeFileSync(
    resolve(homeDir, ".claude.json"),
    JSON.stringify(
      {
        projects: {
          [projectRoot]: {
            allowedTools: [],
            mcpContextUris: [],
            mcpServers: {
              atlassian: {
                type: "http",
                url: ATLASSIAN_MCP_URL
              }
            }
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
}

describe("integration: init wizard flow", () => {
  it("writes config, deploys assets, and completes within 60 seconds (jira path)", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeClaudeJiraMcpConfig(homeDir, cwd);

    const startTime = Date.now();
    const result = await runInitCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      branchPatternSuggester: () => "story/*",
      collectInitAnswers: async ({ suggestedBranchPattern }) => ({
        pmTool: "jira",
        gitHost: "gitlab",
        branchPattern: suggestedBranchPattern,
        jira: {
          projectKey: "PROJ",
          boardId: "77"
        }
      })
    });
    const elapsedMs = Date.now() - startTime;

    const configPath = resolve(cwd, ".tiqora.yaml");
    const userConfigPath = resolve(homeDir, ".tiqora", "config.yaml");
    const configContent = readFileSync(configPath, "utf8");
    const userConfigContent = readFileSync(userConfigPath, "utf8");
    expect(result.selected.targetPath).toBe(targetDir);
    expect(configContent).toContain("pm_tool: jira");
    expect(configContent).toContain("git_host: gitlab");
    expect(configContent).toContain("branch_pattern: 'story/*'");
    expect(configContent).not.toContain("user_name:");
    expect(configContent).toContain("document_language: 'English'");
    expect(userConfigContent).toContain("user_name: 'Developer'");
    expect(userConfigContent).toContain("communication_language: 'Français'");
    expect(userConfigContent).not.toContain("document_language:");
    expect(configContent).toContain("\njira:\n");
    expect(configContent).toContain("project_key: PROJ");
    expect(configContent).toContain("board_id: '77'");
    expect(result.deploymentSummary.filesCopied).toHaveLength(COMMAND_FILES.length);
    expect(existsSync(resolve(cwd, ".tiqora", "workflows", "runs"))).toBe(true);
    expect(existsSync(resolve(cwd, ".tiqora", "sync"))).toBe(true);
    expect(elapsedMs).toBeLessThan(60_000);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("omits jira fields when pm tool is not jira", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    await runInitCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      collectInitAnswers: async () => ({
        pmTool: "none",
        gitHost: "github",
        branchPattern: "feature/*"
      })
    });

    const configPath = resolve(cwd, ".tiqora.yaml");
    const userConfigPath = resolve(homeDir, ".tiqora", "config.yaml");
    const configContent = readFileSync(configPath, "utf8");
    const userConfigContent = readFileSync(userConfigPath, "utf8");
    expect(configContent).toContain("pm_tool: none");
    expect(configContent).toContain("git_host: github");
    expect(configContent).not.toContain("user_name:");
    expect(configContent).toContain("document_language: 'English'");
    expect(userConfigContent).toContain("user_name: 'Developer'");
    expect(userConfigContent).toContain("communication_language: 'Français'");
    expect(userConfigContent).not.toContain("document_language:");
    expect(configContent).not.toContain("\njira:\n");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("prefills from existing config and updates it", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeClaudeJiraMcpConfig(homeDir, cwd);
    mkdirSync(resolve(homeDir, ".tiqora"), { recursive: true });
    writeFileSync(
      resolve(homeDir, ".tiqora", "config.yaml"),
      [
        "user_name: 'Thomas'",
        "idle_threshold_minutes: 20",
        "communication_language: 'en'"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      resolve(cwd, ".tiqora.yaml"),
      [
        "pm_tool: jira",
        "git_host: gitlab",
        "branch_pattern: 'legacy/*'",
        "document_language: 'fr'",
        "jira:",
        "  project_key: OLD",
        "  board_id: '10'"
      ].join("\n"),
      "utf8"
    );

    const collectInitAnswers = vi.fn(async ({ existingConfig }) => ({
      pmTool: existingConfig?.pmTool ?? "none",
      userName: existingConfig?.userName,
      gitHost: "github" as const,
      branchPattern: existingConfig?.branchPattern ?? "feature/*",
      communicationLanguage: existingConfig?.communicationLanguage,
      documentLanguage: existingConfig?.documentLanguage,
      jira: existingConfig?.jira
    }));

    await runInitCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      collectInitAnswers
    });

    expect(collectInitAnswers).toHaveBeenCalledTimes(1);
    expect(collectInitAnswers.mock.calls[0]?.[0]?.existingConfig).toMatchObject({
      pmTool: "jira",
      userName: "Thomas",
      gitHost: "gitlab",
      branchPattern: "legacy/*",
      idleThresholdMinutes: 20,
      communicationLanguage: "en",
      documentLanguage: "fr",
      jira: {
        projectKey: "OLD",
        boardId: "10"
      }
    });
    const configContent = readFileSync(resolve(cwd, ".tiqora.yaml"), "utf8");
    const userConfigContent = readFileSync(resolve(homeDir, ".tiqora", "config.yaml"), "utf8");
    expect(configContent).toContain("pm_tool: jira");
    expect(configContent).toContain("git_host: github");
    expect(configContent).toContain("branch_pattern: 'legacy/*'");
    expect(configContent).toContain("document_language: 'fr'");
    expect(configContent).not.toContain("communication_language:");
    expect(userConfigContent).toContain("user_name: 'Thomas'");
    expect(userConfigContent).toContain("communication_language: 'en'");
    expect(userConfigContent).not.toContain("document_language:");
    expect(configContent).toContain("\njira:\n");
    expect(existsSync(resolve(targetDir, PRIMARY_COMMAND_FILE))).toBe(true);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("cancels safely without writing config", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    await expect(
      runInitCommand({
        cwd,
        homeDir,
        templateSourceDir: templateDir,
        collectInitAnswers: async () => null
      })
    ).rejects.toThrow(/cancelled/u);

    expect(existsSync(resolve(cwd, ".tiqora.yaml"))).toBe(false);
    expect(existsSync(resolve(targetDir, PRIMARY_COMMAND_FILE))).toBe(false);
    expect(existsSync(resolve(cwd, ".gitignore"))).toBe(false);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("ignores legacy .timetracker artifacts during init", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    const legacySessions = resolve(cwd, ".timetracker", "sessions");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(legacySessions, { recursive: true });
    writeFileSync(
      resolve(legacySessions, "current.json"),
      '{"activeSessionId":"2026-02-20-EX-201"}\n',
      "utf8"
    );
    writeFileSync(
      resolve(legacySessions, "2026-02-20-EX-201.json"),
      '{"ticketId":"EX-201"}\n',
      "utf8"
    );

    const result = await runInitCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      collectInitAnswers: async () => ({
        pmTool: "none",
        gitHost: "github",
        branchPattern: "feature/*"
      })
    });

    expect(result.deploymentSummary.workspaceSummary.directoriesCreated).toContain(
      ".tiqora/sessions"
    );
    expect(existsSync(resolve(cwd, ".tiqora", "sessions", "2026-02-20-EX-201.json"))).toBe(false);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("auto-configures Jira MCP for selected Claude environment when missing", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-init-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const result = await runInitCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      collectInitAnswers: async () => ({
        pmTool: "jira",
        gitHost: "gitlab",
        branchPattern: "feature/*",
        jira: {
          projectKey: "PROJ",
          boardId: "42"
        }
      })
    });
    expect(result.selected.targetPath).toBe(targetDir);
    expect(existsSync(resolve(homeDir, ".claude.json"))).toBe(true);
    expect(readFileSync(resolve(homeDir, ".claude.json"), "utf8")).toContain(ATLASSIAN_MCP_URL);

    rmSync(sandbox, { recursive: true, force: true });
  });
});
