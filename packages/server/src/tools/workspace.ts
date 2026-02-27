import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { StoredWorkspace } from "@tiqora/shared";

export function registerWorkspaceTools(server: McpServer, workspace: StoredWorkspace): void {
  const topology =
    (workspace as StoredWorkspace & { topology?: "mono" | "multi" }).topology
    ?? (workspace.repos.length > 1 ? "multi" : "mono");

  server.tool(
    "workspace_info",
    "Get the current workspace information including name, PM tool, and project key",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: workspace.id,
              name: workspace.name,
              pmTool: workspace.pmTool ?? null,
              projectKey: workspace.projectKey ?? null,
              topology,
              repoCount: workspace.repos.length,
              documentLanguage: workspace.documentLanguage ?? "en"
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.tool(
    "workspace_context",
    "Get the workspace architectural context, conventions, and key entry points",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text:
            workspace.context != null
              ? JSON.stringify(workspace.context, null, 2)
              : "No context generated yet. Use the Discovery Workflow in Tiqora Desktop to generate workspace context."
        }
      ]
    })
  );

  server.tool(
    "workspace_repos",
    "List all repositories in this workspace with their tech stack profiles",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            workspace.repos.map((r) => ({
              name: r.name,
              localPath: r.localPath,
              role: r.role,
              profile: r.profile,
              llmDocs: r.llmDocs,
              url: r.url ?? null
            })),
            null,
            2
          )
        }
      ]
    })
  );
}
