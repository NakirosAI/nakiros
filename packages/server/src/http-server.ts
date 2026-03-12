import cors from "cors";
import express from "express";

import { handleMcpRequest } from "./mcp.js";
import { IStorage, SQLiteStorage } from "./storage.js";
import { resolveWorkspaceId } from "./workspace-resolver.js";

const startTime = Date.now();

let _storage: IStorage | null = null;
function getStorage(): IStorage {
  if (!_storage) _storage = new SQLiteStorage();
  return _storage;
}

export function createHttpServer(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ─── Status ──────────────────────────────────────────────────────────────

  app.get("/status", async (_req, res) => {
    const workspaces = await getStorage().readWorkspaces();
    res.json({
      status: "running",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        repos: w.repos.length,
        pmTool: w.pmTool ?? null
      }))
    });
  });

  // ─── MCP by workspace ID ─────────────────────────────────────────────────

  app.all("/ws/:workspaceId/mcp", async (req, res) => {
    const storage = getStorage();
    const workspace = await storage.readWorkspace(req.params["workspaceId"]!);
    if (!workspace) {
      res.status(404).json({
        error: `Workspace '${req.params["workspaceId"]}' not found`,
        hint: "Use GET /status to list available workspace IDs"
      });
      return;
    }
    await handleMcpRequest(req, res, workspace, storage);
  });

  // ─── MCP by cwd (workflows: only need mcp_server_url in config) ──────────

  app.all("/mcp", async (req, res) => {
    const cwd = req.headers["x-nakiros-cwd"] as string | undefined;
    if (!cwd) {
      res.status(400).json({ error: "Missing X-Nakiros-Cwd header" });
      return;
    }
    const storage = getStorage();
    const workspaceId = await resolveWorkspaceId(cwd, storage);
    if (!workspaceId) {
      res.status(404).json({
        error: `No workspace found for cwd: ${cwd}`,
        hint: "Ensure _nakiros/workspace.yaml exists in the project root and matches a workspace in Nakiros Desktop"
      });
      return;
    }
    const workspace = await storage.readWorkspace(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: `Workspace '${workspaceId}' not found` });
      return;
    }
    await handleMcpRequest(req, res, workspace, storage);
  });

  // ─── REST: context write (for Desktop) ───────────────────────────────────

  app.put("/ws/:workspaceId/context", async (req, res) => {
    const storage = getStorage();
    const workspace = await storage.readWorkspace(req.params["workspaceId"]!);
    if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }
    const patch = req.body as Partial<{ global: string; product: string; interRepo: string }>;
    workspace.context = { ...workspace.context, ...patch };
    await storage.writeWorkspace(workspace);
    res.json({ ok: true });
  });

  app.put("/ws/:workspaceId/repos/:repoName/context", async (req, res) => {
    const storage = getStorage();
    const workspace = await storage.readWorkspace(req.params["workspaceId"]!);
    if (!workspace) { res.status(404).json({ error: "Workspace not found" }); return; }
    const repoName = req.params["repoName"]!;
    const patch = req.body as Partial<{ architecture: string; stack: string; conventions: string; api: string; llms: string }>;
    workspace.context = {
      ...workspace.context,
      repos: {
        ...workspace.context?.repos,
        [repoName]: { ...workspace.context?.repos?.[repoName], ...patch, updatedAt: new Date().toISOString() }
      }
    };
    await storage.writeWorkspace(workspace);
    res.json({ ok: true });
  });

  // ─── REST: collab sessions (for Desktop) ─────────────────────────────────

  app.get("/ws/:workspaceId/collabs", async (req, res) => {
    const collabs = await getStorage().readCollabs(req.params["workspaceId"]!);
    res.json(collabs);
  });

  app.get("/ws/:workspaceId/collabs/:collabId", async (req, res) => {
    const collab = await getStorage().readCollab(req.params["collabId"]!);
    if (!collab) { res.status(404).json({ error: "Collab session not found" }); return; }
    res.json(collab);
  });

  return app;
}
