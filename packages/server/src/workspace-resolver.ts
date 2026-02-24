import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parse } from "yaml";

interface WorkspaceYaml {
  workspace_id?: string;
}

export function resolveWorkspaceId(cwd: string): string | null {
  let dir = cwd;

  for (let i = 0; i < 5; i++) {
    const configPath = join(dir, ".tiqora", "workspace.yaml");
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const parsed = parse(content) as WorkspaceYaml;
        return parsed.workspace_id ?? null;
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
