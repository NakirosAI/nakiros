import { z } from 'zod/v4';

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CollabMessage, CollabSession, RepoContext, StoredWorkspace } from "@nakiros/shared";

import type { IStorage } from "../storage.js";

export function registerWorkspaceTools(server: McpServer, workspace: StoredWorkspace, storage: IStorage): void {
  const topology =
    (workspace as StoredWorkspace & { topology?: "mono" | "multi" }).topology
    ?? (workspace.repos.length > 1 ? "multi" : "mono");

  // ─── READ: workspace info ────────────────────────────────────────────────

  server.tool(
    "workspace_info",
    "Get the current workspace information including name, PM tool, and project key",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          id: workspace.id,
          name: workspace.name,
          pmTool: workspace.pmTool ?? null,
          projectKey: workspace.projectKey ?? null,
          branchPattern: workspace.branchPattern ?? null,
          topology,
          repoCount: workspace.repos.length,
          documentLanguage: workspace.documentLanguage ?? "en"
        }, null, 2)
      }]
    })
  );

  server.tool(
    "workspace_context",
    "Get the workspace architectural context, conventions, and key entry points",
    {},
    async () => ({
      content: [{
        type: "text",
        text: workspace.context != null
          ? JSON.stringify(workspace.context, null, 2)
          : "No context generated yet. Use the Discovery Workflow in Nakiros Desktop to generate workspace context."
      }]
    })
  );

  server.tool(
    "workspace_repos",
    "List all repositories in this workspace with their tech stack profiles",
    {},
    async () => ({
      content: [{
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
          null, 2
        )
      }]
    })
  );

  // ─── READ: granular context ──────────────────────────────────────────────

  server.tool(
    "workspace_global_context",
    "Get the global workspace context (system overview, architecture summary, main flows)",
    {},
    async () => ({
      content: [{ type: "text", text: workspace.context?.global ?? "No global context generated yet." }]
    })
  );

  server.tool(
    "workspace_product_context",
    "Get the product context (product purpose, users, capabilities, domain glossary)",
    {},
    async () => ({
      content: [{ type: "text", text: workspace.context?.product ?? "No product context generated yet." }]
    })
  );

  server.tool(
    "repo_context_get",
    "Get the full context for a specific repository (architecture, stack, conventions, api, llms)",
    { repoName: z.string().describe("Repository name as defined in the workspace") },
    async ({ repoName }) => ({
      content: [{
        type: "text",
        text: workspace.context?.repos?.[repoName] != null
          ? JSON.stringify(workspace.context.repos[repoName], null, 2)
          : `No context found for repo '${repoName}'. Available repos: ${workspace.repos.map(r => r.name).join(', ')}`
      }]
    })
  );

  // ─── WRITE: context ──────────────────────────────────────────────────────

  server.tool(
    "workspace_context_set",
    "Write or update a workspace-level context field (global, product, or interRepo)",
    {
      field: z.enum(["global", "product", "interRepo", "brainstorming"]).describe("Which context field to update"),
      content: z.string().describe("The markdown content to store")
    },
    async ({ field, content }) => {
      const updated: StoredWorkspace = {
        ...workspace,
        context: { ...workspace.context, [field]: content }
      };
      await storage.writeWorkspace(updated);
      Object.assign(workspace, updated);
      return { content: [{ type: "text" as const, text: `✓ workspace.context.${field} updated` }] };
    }
  );

  server.tool(
    "repo_context_set",
    "Write or update a specific context field for a repository (architecture, stack, conventions, api, or llms)",
    {
      repoName: z.string().describe("Repository name as defined in the workspace"),
      field: z.enum(["architecture", "stack", "conventions", "api", "llms"]).describe("Which repo context field to update"),
      content: z.string().describe("The markdown content to store")
    },
    async ({ repoName, field, content }) => {
      const existingRepo: RepoContext = workspace.context?.repos?.[repoName] ?? {};
      const updated: StoredWorkspace = {
        ...workspace,
        context: {
          ...workspace.context,
          repos: {
            ...workspace.context?.repos,
            [repoName]: { ...existingRepo, [field]: content, updatedAt: new Date().toISOString() }
          }
        }
      };
      await storage.writeWorkspace(updated);
      Object.assign(workspace, updated);
      return { content: [{ type: "text" as const, text: `✓ ${repoName}.${field} updated` }] };
    }
  );

  // ─── COLLABORATION ───────────────────────────────────────────────────────

  server.tool(
    "collab_create",
    "Create a new collaboration session between agents (cross-model or cross-role). Returns the session ID to share with the other agent.",
    { topic: z.string().describe("The topic or question to discuss between agents") },
    async ({ topic }) => {
      const session: CollabSession = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        topic,
        status: "open",
        messages: [],
        createdAt: new Date().toISOString(),
      };
      await storage.writeCollab(session);
      return { content: [{ type: "text" as const, text: JSON.stringify({ id: session.id, topic, status: "open" }) }] };
    }
  );

  server.tool(
    "collab_post",
    "Post a message to a collaboration session. Use agentRole to identify who you are (e.g. 'pm', 'architect', 'codex-architect').",
    {
      sessionId: z.string().describe("The collaboration session ID"),
      agentRole: z.string().describe("Your role (e.g. 'pm', 'architect', 'qa', 'codex-architect')"),
      content: z.string().describe("Your message or analysis to share"),
      model: z.string().optional().describe("Your model identifier (e.g. 'claude', 'codex', 'gemini')"),
      respondingTo: z.string().optional().describe("Message ID you are responding to (optional)")
    },
    async ({ sessionId, agentRole, content, model, respondingTo }) => {
      const session = await storage.readCollab(sessionId);
      if (!session) return { content: [{ type: "text" as const, text: `Error: session '${sessionId}' not found` }] };
      if (session.status === "resolved") return { content: [{ type: "text" as const, text: `Error: session '${sessionId}' is already resolved` }] };
      const message: CollabMessage = {
        id: crypto.randomUUID(),
        agentRole,
        model,
        content,
        respondingTo,
        postedAt: new Date().toISOString(),
      };
      session.messages.push(message);
      await storage.writeCollab(session);
      return { content: [{ type: "text" as const, text: JSON.stringify({ messageId: message.id, totalMessages: session.messages.length }) }] };
    }
  );

  server.tool(
    "collab_read",
    "Read all messages in a collaboration session",
    { sessionId: z.string().describe("The collaboration session ID") },
    async ({ sessionId }) => {
      const session = await storage.readCollab(sessionId);
      if (!session) return { content: [{ type: "text" as const, text: `Error: session '${sessionId}' not found` }] };
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ id: session.id, topic: session.topic, status: session.status, messages: session.messages, synthesis: session.synthesis ?? null }, null, 2)
        }]
      };
    }
  );

  server.tool(
    "collab_resolve",
    "Mark a collaboration session as resolved with a final synthesis",
    {
      sessionId: z.string().describe("The collaboration session ID"),
      synthesis: z.string().describe("The final decision or synthesis from the collaboration")
    },
    async ({ sessionId, synthesis }) => {
      const session = await storage.readCollab(sessionId);
      if (!session) return { content: [{ type: "text" as const, text: `Error: session '${sessionId}' not found` }] };
      session.status = "resolved";
      session.synthesis = synthesis;
      session.resolvedAt = new Date().toISOString();
      await storage.writeCollab(session);
      return { content: [{ type: "text" as const, text: `✓ Session resolved. Synthesis stored.` }] };
    }
  );
}
