import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { runInitCommand } from "../../src/commands/init.js";
import { runInstallCommand } from "../../src/commands/install.js";
import { COMMAND_TEMPLATE_FILES } from "../../src/utils/file-ops.js";

const COMMAND_FILES = COMMAND_TEMPLATE_FILES;
const PRIMARY_COMMAND_FILE = COMMAND_FILES[0];

const CONFIG_CONTENT = [
  "pm_tool: jira",
  "git_host: gitlab",
  "branch_pattern: feature/*",
  "idle_threshold_minutes: 15"
].join("\n");
const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

const collectInitAnswers = async ({
  suggestedBranchPattern
}: {
  suggestedBranchPattern: string;
}) => ({
  pmTool: "none" as const,
  gitHost: "github" as const,
  branchPattern: suggestedBranchPattern
});

function writeTemplateSet(templateDir: string): void {
  mkdirSync(templateDir, { recursive: true });

  for (const fileName of COMMAND_FILES) {
    writeFileSync(resolve(templateDir, fileName), `template:${fileName}\n`, "utf8");
  }
}

function writeRuntimeConfig(projectRoot: string): void {
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(resolve(projectRoot, ".tiqora.yaml"), CONFIG_CONTENT, "utf8");
}

function writeClaudeJiraMcpConfig(homeDir: string, projectRoot: string): void {
  writeFileSync(
    resolve(homeDir, ".claude.json"),
    JSON.stringify(
      {
        projects: {
          [projectRoot]: {
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

function writeCursorJiraMcpConfig(homeDir: string): void {
  mkdirSync(resolve(homeDir, ".cursor"), { recursive: true });
  writeFileSync(
    resolve(homeDir, ".cursor", "mcp.json"),
    JSON.stringify(
      {
        mcpServers: {
          Atlassian: {
            url: ATLASSIAN_MCP_URL,
            headers: {}
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );
}

describe("integration: deployment flow for init/install", () => {
  it("init deploys templates after environment selection and patches .gitignore", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-deploy-int-"));
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
      collectInitAnswers
    });

    expect(result.selected.targetPath).toBe(targetDir);
    expect(result.deploymentSummary.deployedTargets).toEqual([targetDir]);
    expect(result.deploymentSummary.filesCopied).toHaveLength(COMMAND_FILES.length);
    expect(result.deploymentSummary.filesSkipped).toHaveLength(0);
    expect(result.deploymentSummary.gitignorePatched).toBe(true);
    expect(readFileSync(resolve(cwd, ".gitignore"), "utf8")).toContain(".tiqora/");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("install deploys to multiple selected targets", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-deploy-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(resolve(cwd, ".claude"), { recursive: true });
    mkdirSync(resolve(cwd, ".cursor"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeRuntimeConfig(cwd);
    writeClaudeJiraMcpConfig(homeDir, cwd);
    writeCursorJiraMcpConfig(homeDir);

    const result = await runInstallCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      selectEnvironments: async () => ["project:claude-code", "project:cursor"]
    });

    const claudeTarget = resolve(cwd, ".claude", "commands");
    const cursorTarget = resolve(cwd, ".cursor", "commands");
    expect(result.selectedTargets.map((item) => item.targetPath)).toEqual([claudeTarget, cursorTarget]);
    expect(result.deploymentSummary.deployedTargets).toEqual([claudeTarget, cursorTarget]);
    expect(result.deploymentSummary.filesCopied).toHaveLength(COMMAND_FILES.length * 2);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("manual path fallback receives templates", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-deploy-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const manualTarget = resolve(cwd, ".manual", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(cwd, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeRuntimeConfig(cwd);

    const result = await runInstallCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      promptManualPath: async () => manualTarget
    });

    expect(result.needsManualPath).toBe(true);
    expect(result.selected.targetPath).toBe(manualTarget);
    expect(result.deploymentSummary.deployedTargets).toEqual([manualTarget]);
    expect(result.deploymentSummary.filesCopied).toHaveLength(COMMAND_FILES.length);
    expect(readFileSync(resolve(manualTarget, PRIMARY_COMMAND_FILE), "utf8")).toBe(
      `template:${PRIMARY_COMMAND_FILE}\n`
    );

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("deployment summary reflects skipped files when overwrite is declined", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-deploy-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(cwd, ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "custom command\n", "utf8");

    const confirmOverwrite = vi.fn(async () => false);
    const result = await runInitCommand({
      cwd,
      homeDir,
      templateSourceDir: templateDir,
      confirmOverwrite,
      collectInitAnswers
    });

    expect(confirmOverwrite).toHaveBeenCalledTimes(1);
    expect(result.deploymentSummary.filesSkipped).toEqual([resolve(targetDir, PRIMARY_COMMAND_FILE)]);
    expect(result.deploymentSummary.filesOverwritten).toEqual([]);
    expect(readFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "utf8")).toBe("custom command\n");

    rmSync(sandbox, { recursive: true, force: true });
  });
});
