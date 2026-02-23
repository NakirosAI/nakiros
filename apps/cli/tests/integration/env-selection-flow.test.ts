import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { runInitCommand } from "../../src/commands/init.js";
import { runInstallCommand } from "../../src/commands/install.js";

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

function writeCodexJiraMcpConfig(homeDir: string): void {
  mkdirSync(resolve(homeDir, ".codex"), { recursive: true });
  writeFileSync(
    resolve(homeDir, ".codex", "config.toml"),
    [
      "[mcp_servers.jira]",
      "enabled = true",
      `url = "${ATLASSIAN_MCP_URL}"`
    ].join("\n"),
    "utf8"
  );
}

describe("integration: init/install environment selection flow", () => {
  it("auto-selects when a single environment is detected", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const selectEnvironment = vi.fn(async () => "project:cursor");
    const selectEnvironments = vi.fn(async () => ["project:cursor"]);
    const promptManualPath = vi.fn(async () => resolve(cwd, ".custom", "commands"));

    const initResult = await runInitCommand({
      cwd,
      homeDir,
      force: true,
      selectEnvironment,
      selectEnvironments,
      promptManualPath,
      collectInitAnswers
    });

    const installResult = await runInstallCommand({
      cwd,
      homeDir,
      force: true,
      selectEnvironment,
      selectEnvironments,
      promptManualPath
    });

    expect(initResult.selected?.envId).toBe("claude-code");
    expect(installResult.selected?.envId).toBe("claude-code");
    expect(selectEnvironment).not.toHaveBeenCalled();
    expect(selectEnvironments).not.toHaveBeenCalled();
    expect(promptManualPath).not.toHaveBeenCalled();

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("prompts for multi-selection when multiple environments are detected", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(resolve(cwd, ".cursor", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeRuntimeConfig(cwd);
    writeClaudeJiraMcpConfig(homeDir, cwd);
    writeCursorJiraMcpConfig(homeDir);

    const selectEnvironments = vi.fn(async () => ["project:claude-code", "project:cursor"]);
    const promptManualPath = vi.fn(async () => resolve(cwd, ".custom", "commands"));

    const result = await runInstallCommand({
      cwd,
      homeDir,
      selectEnvironments,
      promptManualPath
    });

    expect(selectEnvironments).toHaveBeenCalledTimes(1);
    expect(promptManualPath).not.toHaveBeenCalled();
    expect(result.selectedTargets.map((entry) => entry.envId)).toEqual(["claude-code", "cursor"]);
    expect(result.selectedTargets.map((entry) => entry.targetPath)).toEqual([
      resolve(cwd, ".claude", "commands"),
      resolve(cwd, ".cursor", "commands")
    ]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("prompts for multi-selection in init when multiple environments are detected", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(resolve(cwd, ".cursor", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const selectEnvironments = vi.fn(async () => ["project:cursor"]);
    const promptManualPath = vi.fn(async () => resolve(cwd, ".custom", "commands"));

    const result = await runInitCommand({
      cwd,
      homeDir,
      selectEnvironments,
      promptManualPath,
      collectInitAnswers
    });

    expect(selectEnvironments).toHaveBeenCalledTimes(1);
    expect(promptManualPath).not.toHaveBeenCalled();
    expect(result.selectedTargets.map((entry) => entry.envId)).toEqual(["cursor"]);
    expect(result.selectedTargets.map((entry) => entry.targetPath)).toEqual([
      resolve(cwd, ".cursor", "commands")
    ]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("falls back to manual prompt when no environment is detected", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const manualTarget = resolve(cwd, ".manual", "commands");
    const selectEnvironment = vi.fn(async () => "project:claude-code");
    const selectEnvironments = vi.fn(async () => ["project:claude-code"]);
    const promptManualPath = vi.fn(async () => manualTarget);

    const result = await runInitCommand({
      cwd,
      homeDir,
      selectEnvironment,
      selectEnvironments,
      promptManualPath,
      collectInitAnswers
    });

    expect(selectEnvironment).not.toHaveBeenCalled();
    expect(selectEnvironments).not.toHaveBeenCalled();
    expect(promptManualPath).toHaveBeenCalledTimes(1);
    expect(result.needsManualPath).toBe(true);
    expect(result.selected?.envId).toBe("manual");
    expect(result.selected?.targetPath).toBe(manualTarget);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("detects Codex from global scope when project has no env directory", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-env-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(resolve(homeDir, ".codex"), { recursive: true });
    writeRuntimeConfig(cwd);
    writeCodexJiraMcpConfig(homeDir);

    const selectEnvironments = vi.fn(async () => ["home:codex"]);
    const promptManualPath = vi.fn(async () => resolve(cwd, ".manual", "commands"));

    const result = await runInstallCommand({
      cwd,
      homeDir,
      selectEnvironments,
      promptManualPath
    });

    expect(selectEnvironments).not.toHaveBeenCalled();
    expect(promptManualPath).not.toHaveBeenCalled();
    expect(result.selected?.envId).toBe("codex");
    expect(result.selected?.source).toBe("home");
    expect(result.selected?.targetPath).toBe(resolve(homeDir, ".codex", "prompts"));

    rmSync(sandbox, { recursive: true, force: true });
  });
});
