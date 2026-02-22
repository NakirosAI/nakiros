import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";

import type { SelectedEnvironment } from "./env-detect.js";

export const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

export interface JiraMcpEnsureOptions {
  projectRoot?: string;
  homeDir?: string;
  selectedTargets: Array<Pick<SelectedEnvironment, "envId" | "label">>;
}

export function ensureJiraMcpConfigured(options: JiraMcpEnsureOptions): void {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const homeDir = resolve(options.homeDir ?? homedir());
  const envIds = new Set(options.selectedTargets.map((target) => target.envId));

  for (const envId of envIds) {
    if (envId === "manual") {
      continue;
    }

    if (envId === "codex") {
      ensureCodexJiraMcp(resolve(homeDir, ".codex", "config.toml"));
      continue;
    }

    if (envId === "claude-code") {
      ensureClaudeJiraMcp(resolve(homeDir, ".claude.json"), projectRoot);
      continue;
    }

    if (envId === "cursor") {
      ensureCursorJiraMcp(resolve(homeDir, ".cursor", "mcp.json"));
      continue;
    }
  }
}

function ensureCodexJiraMcp(configPath: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const rawContent = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const content = normalizeInlineSectionFormatting(rawContent);
  const sectionName = getTomlSectionName(content, ["mcp_servers.jira", "mcp_servers.atlassian"]);

  if (!sectionName) {
    const nextContent = appendTomlSection(content, "mcp_servers.jira", [
      "enabled = true",
      `url = "${ATLASSIAN_MCP_URL}"`
    ]);
    writeFileSync(configPath, nextContent, "utf8");
    return;
  }

  const sectionRange = getTomlSectionRange(content, sectionName);
  if (!sectionRange) {
    const nextContent = appendTomlSection(content, sectionName, [
      "enabled = true",
      `url = "${ATLASSIAN_MCP_URL}"`
    ]);
    writeFileSync(configPath, nextContent, "utf8");
    return;
  }

  const updatedSectionBody = upsertTomlKey(
    upsertTomlKey(sectionRange.body, "enabled", "true"),
    "url",
    `"${ATLASSIAN_MCP_URL}"`
  );
  const formattedSectionBody = ensureTomlSectionBodyStartsOnNewLine(updatedSectionBody);
  const nextContent = `${content.slice(0, sectionRange.start)}${formattedSectionBody}${content.slice(
    sectionRange.end
  )}`;
  writeFileSync(configPath, nextContent, "utf8");
}

function ensureClaudeJiraMcp(configPath: string, projectRoot: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const parsed = readJsonOrDefault(configPath, {});
  const rootRecord = asRecord(parsed);
  if (!rootRecord) {
    throw new Error(`✗ ${configPath} must contain a JSON object`);
  }

  const projects = asRecord(rootRecord.projects) ?? {};
  const bestProject = findBestProjectMatch(projects, projectRoot);
  const projectKey = bestProject?.key ?? resolve(projectRoot);
  const projectConfig = asRecord(projects[projectKey]) ?? {};
  const mcpServers = asRecord(projectConfig.mcpServers) ?? {};
  const atlassianKey =
    Object.keys(mcpServers).find((key) => key.toLowerCase() === "atlassian") ?? "atlassian";
  const atlassianServer = asRecord(mcpServers[atlassianKey]) ?? {};

  mcpServers[atlassianKey] = {
    ...atlassianServer,
    type: "http",
    url: ATLASSIAN_MCP_URL
  };
  projectConfig.mcpServers = mcpServers;
  projects[projectKey] = projectConfig;
  rootRecord.projects = projects;

  writeFileSync(configPath, `${JSON.stringify(rootRecord, null, 2)}\n`, "utf8");
}

function ensureCursorJiraMcp(configPath: string): void {
  mkdirSync(dirname(configPath), { recursive: true });
  const parsed = readJsonOrDefault(configPath, {});
  const rootRecord = asRecord(parsed);
  if (!rootRecord) {
    throw new Error(`✗ ${configPath} must contain a JSON object`);
  }

  const mcpServers = asRecord(rootRecord.mcpServers) ?? {};
  const atlassianKey =
    Object.keys(mcpServers).find((key) => key.toLowerCase() === "atlassian") ?? "Atlassian";
  const atlassianServer = asRecord(mcpServers[atlassianKey]) ?? {};

  mcpServers[atlassianKey] = {
    ...atlassianServer,
    url: ATLASSIAN_MCP_URL,
    headers: asRecord(atlassianServer.headers) ?? {}
  };
  rootRecord.mcpServers = mcpServers;

  writeFileSync(configPath, `${JSON.stringify(rootRecord, null, 2)}\n`, "utf8");
}

function appendTomlSection(content: string, sectionName: string, lines: string[]): string {
  const prefix = content.trim().length === 0 ? "" : content.endsWith("\n") ? content : `${content}\n`;
  return `${prefix}[${sectionName}]\n${lines.join("\n")}\n`;
}

function getTomlSectionName(content: string, sectionNames: string[]): string | null {
  for (const sectionName of sectionNames) {
    const sectionHeader = new RegExp(`^\\s*\\[${escapeForRegex(sectionName)}\\]\\s*$`, "m");
    if (sectionHeader.test(content)) {
      return sectionName;
    }
  }

  return null;
}

function getTomlSectionRange(
  content: string,
  sectionName: string
): { start: number; end: number; body: string } | null {
  const sectionHeader = new RegExp(`^\\s*\\[${escapeForRegex(sectionName)}\\]\\s*$`, "m");
  const match = sectionHeader.exec(content);
  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index + match[0].length;
  const remaining = content.slice(start);
  const nextSection = /^\s*\[[^\]]+\]\s*$/m.exec(remaining);
  const end = nextSection?.index !== undefined ? start + nextSection.index : content.length;
  return {
    start,
    end,
    body: content.slice(start, end)
  };
}

function upsertTomlKey(sectionBody: string, key: string, valueLiteral: string): string {
  const keyPattern = new RegExp(`^\\s*${escapeForRegex(key)}\\s*=.*$`, "m");
  const line = `${key} = ${valueLiteral}`;
  if (keyPattern.test(sectionBody)) {
    return sectionBody.replace(keyPattern, line);
  }

  if (sectionBody.trim().length === 0) {
    return `\n${line}\n`;
  }

  const suffix = sectionBody.endsWith("\n") ? "" : "\n";
  return `${sectionBody}${suffix}${line}\n`;
}

function ensureTomlSectionBodyStartsOnNewLine(sectionBody: string): string {
  if (sectionBody.startsWith("\n")) {
    return sectionBody;
  }

  return `\n${sectionBody}`;
}

function normalizeInlineSectionFormatting(content: string): string {
  return content.replace(
    /(\[mcp_servers\.(?:jira|atlassian)\])\s*(enabled\s*=)/giu,
    "$1\n$2"
  );
}

function readJsonOrDefault(path: string, fallback: unknown): unknown {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`✗ ${path} is not valid JSON`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function findBestProjectMatch(
  projects: Record<string, unknown>,
  projectRoot: string
): { key: string; value: unknown } | null {
  const normalizedRoot = normalizePath(projectRoot);
  let best: { key: string; value: unknown } | null = null;
  let bestLength = -1;

  for (const [key, value] of Object.entries(projects)) {
    const normalizedKey = normalizePath(key);
    const isExactMatch = normalizedRoot === normalizedKey;
    const isPrefixMatch = normalizedRoot.startsWith(`${normalizedKey}${sep}`);
    if (!isExactMatch && !isPrefixMatch) {
      continue;
    }

    if (normalizedKey.length > bestLength) {
      best = { key, value };
      bestLength = normalizedKey.length;
    }
  }

  return best;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizePath(pathValue: string): string {
  const resolved = resolve(pathValue);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}
