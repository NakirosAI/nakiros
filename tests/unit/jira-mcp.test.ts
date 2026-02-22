import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { ATLASSIAN_MCP_URL, ensureJiraMcpConfigured } from "../../src/utils/jira-mcp.js";

describe("unit: jira mcp validation", () => {
  it("accepts valid Codex MCP configuration", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-mcp-unit-"));
    const homeDir = resolve(sandbox, "home");
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

    expect(() =>
      ensureJiraMcpConfigured({
        projectRoot: resolve(sandbox, "repo"),
        homeDir,
        selectedTargets: [{ envId: "codex", label: "Codex" }]
      })
    ).not.toThrow();

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("normalizes Codex TOML with newline between section header and enabled key", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-mcp-unit-"));
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(homeDir, ".codex"), { recursive: true });
    writeFileSync(resolve(homeDir, ".codex", "config.toml"), "[mcp_servers.jira]", "utf8");

    ensureJiraMcpConfigured({
      projectRoot: resolve(sandbox, "repo"),
      homeDir,
      selectedTargets: [{ envId: "codex", label: "Codex" }]
    });

    const content = readFileSync(resolve(homeDir, ".codex", "config.toml"), "utf8");
    expect(content).toContain("[mcp_servers.jira]\nenabled = true");
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("repairs malformed inline Codex TOML section formatting", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-mcp-unit-"));
    const homeDir = resolve(sandbox, "home");
    mkdirSync(resolve(homeDir, ".codex"), { recursive: true });
    writeFileSync(
      resolve(homeDir, ".codex", "config.toml"),
      `[mcp_servers.jira]enabled = true\nurl = "${ATLASSIAN_MCP_URL}"\n`,
      "utf8"
    );

    ensureJiraMcpConfigured({
      projectRoot: resolve(sandbox, "repo"),
      homeDir,
      selectedTargets: [{ envId: "codex", label: "Codex" }]
    });

    const content = readFileSync(resolve(homeDir, ".codex", "config.toml"), "utf8");
    expect(content).toContain("[mcp_servers.jira]\nenabled = true");
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("accepts valid Claude MCP configuration for project", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-mcp-unit-"));
    const homeDir = resolve(sandbox, "home");
    const projectRoot = resolve(sandbox, "repo");
    mkdirSync(homeDir, { recursive: true });
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

    expect(() =>
      ensureJiraMcpConfigured({
        projectRoot,
        homeDir,
        selectedTargets: [{ envId: "claude-code", label: "Claude Code" }]
      })
    ).not.toThrow();

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("auto-creates Cursor MCP config when missing", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-mcp-unit-"));
    const homeDir = resolve(sandbox, "home");
    mkdirSync(homeDir, { recursive: true });

    expect(() =>
      ensureJiraMcpConfigured({
        projectRoot: resolve(sandbox, "repo"),
        homeDir,
        selectedTargets: [{ envId: "cursor", label: "Cursor" }]
      })
    ).not.toThrow();
    const created = readFileSync(resolve(homeDir, ".cursor", "mcp.json"), "utf8");
    expect(created).toContain(ATLASSIAN_MCP_URL);

    rmSync(sandbox, { recursive: true, force: true });
  });
});
