import cors from "cors";
import express from "express";

import { handleMcpRequest } from "./mcp.js";
import { readWorkspace, readWorkspaces } from "./storage.js";

const startTime = Date.now();

export function createHttpServer(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/status", (_req, res) => {
    const workspaces = readWorkspaces();
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

  app.all("/ws/:workspaceId/mcp", async (req, res) => {
    const workspace = readWorkspace(req.params["workspaceId"]!);
    if (!workspace) {
      res.status(404).json({
        error: `Workspace '${req.params["workspaceId"]}' not found`,
        hint: "Use GET /status to list available workspace IDs"
      });
      return;
    }
    await handleMcpRequest(req, res, workspace);
  });

  return app;
}
