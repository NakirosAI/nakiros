import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMAND_TEMPLATE_FILES } from "../../src/utils/file-ops.js";

const VALID_CONFIG_CONTENT = [
  "pm_tool: jira",
  "git_host: gitlab",
  "branch_pattern: feature/*",
  "idle_threshold_minutes: 15"
].join("\n");

const INVALID_CONFIG_MESSAGE =
  "✗ No valid .tiqora.yaml found. Run npx tiqora init first.";
const PRIMARY_COMMAND_FILE = COMMAND_TEMPLATE_FILES[0];
const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

function runInstallCli(cwd: string, homeDir: string) {
  const repoRoot = resolve(__dirname, "..", "..");
  const distCjsPath = resolve(repoRoot, "dist", "index.cjs");

  return spawnSync(process.execPath, [distCjsPath, "install", "--force"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: homeDir
    }
  });
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

describe("integration: install config validation", () => {
  it("succeeds for a valid project config and prints install confirmation", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-install-config-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const targetDir = resolve(cwd, ".claude", "commands");
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(resolve(cwd, ".tiqora.yaml"), VALID_CONFIG_CONTENT, "utf8");
    writeClaudeJiraMcpConfig(homeDir, cwd);

    const result = runInstallCli(cwd, homeDir);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("✓ tiqora installed");
    expect(readFileSync(resolve(cwd, ".gitignore"), "utf8")).toContain(".tiqora/");
    expect(existsSync(resolve(targetDir, PRIMARY_COMMAND_FILE))).toBe(true);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("fails with exact AC2 message and exit code 1 when config is missing", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-install-config-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });

    const result = runInstallCli(cwd, homeDir);
    const output = `${result.stdout}${result.stderr}`.trim();

    expect(result.status).toBe(1);
    expect(output).toBe(INVALID_CONFIG_MESSAGE);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("fails with exact AC2 message and exit code 1 when required keys are missing", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-install-config-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(
      resolve(cwd, ".tiqora.yaml"),
      ["pm_tool: jira", "git_host: gitlab", "idle_threshold_minutes: 15"].join("\n"),
      "utf8"
    );

    const result = runInstallCli(cwd, homeDir);
    const output = `${result.stdout}${result.stderr}`.trim();

    expect(result.status).toBe(1);
    expect(output).toBe(INVALID_CONFIG_MESSAGE);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("fails with exact AC2 message and exit code 1 when idle threshold is invalid", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-install-config-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(
      resolve(cwd, ".tiqora.yaml"),
      [
        "pm_tool: jira",
        "git_host: gitlab",
        "branch_pattern: feature/*",
        "idle_threshold_minutes: nope"
      ].join("\n"),
      "utf8"
    );

    const result = runInstallCli(cwd, homeDir);
    const output = `${result.stdout}${result.stderr}`.trim();

    expect(result.status).toBe(1);
    expect(output).toBe(INVALID_CONFIG_MESSAGE);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("ignores legacy runtime artifacts from .timetracker on install", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-install-config-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    const targetDir = resolve(cwd, ".claude", "commands");
    const legacySessions = resolve(cwd, ".timetracker", "sessions");
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(legacySessions, { recursive: true });
    writeFileSync(resolve(cwd, ".tiqora.yaml"), VALID_CONFIG_CONTENT, "utf8");
    writeClaudeJiraMcpConfig(homeDir, cwd);
    writeFileSync(
      resolve(legacySessions, "current.json"),
      '{"activeSessionId":"2026-02-20-EX-201"}\n',
      "utf8"
    );

    const result = runInstallCli(cwd, homeDir);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).not.toContain("Legacy workspace detected");
    expect(existsSync(resolve(cwd, ".tiqora", "sessions", "current.json"))).toBe(false);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("auto-configures Jira MCP for selected Claude environment when missing", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-install-config-int-"));
    const cwd = resolve(sandbox, "repo");
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(cwd, ".claude", "commands"), { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    writeFileSync(resolve(cwd, ".tiqora.yaml"), VALID_CONFIG_CONTENT, "utf8");

    const result = runInstallCli(cwd, homeDir);
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("✓ tiqora installed");
    expect(existsSync(resolve(homeDir, ".claude.json"))).toBe(true);
    expect(readFileSync(resolve(homeDir, ".claude.json"), "utf8")).toContain(ATLASSIAN_MCP_URL);

    rmSync(sandbox, { recursive: true, force: true });
  });
});
