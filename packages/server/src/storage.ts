import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { StoredWorkspace } from "@nakiros/shared";

function getDataPath(): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Nakiros");
  }
  if (platform === "win32") {
    return join(process.env["APPDATA"] ?? homedir(), "Nakiros");
  }
  return join(homedir(), ".config", "Nakiros");
}

function getWorkspacesPath(): string {
  return join(getDataPath(), "workspaces.json");
}

export function readWorkspaces(): StoredWorkspace[] {
  const path = getWorkspacesPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as StoredWorkspace[];
  } catch {
    return [];
  }
}

export function readWorkspace(id: string): StoredWorkspace | null {
  return readWorkspaces().find((w) => w.id === id) ?? null;
}
