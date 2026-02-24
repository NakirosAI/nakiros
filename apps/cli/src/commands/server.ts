import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Command } from "commander";

const PID_DIR = join(homedir(), ".tiqora");
const PID_FILE = join(PID_DIR, "server.pid");
const DEFAULT_PORT = 3737;

export function registerServerCommand(cli: Command): void {
  const server = cli.command("server").description("Manage the Tiqora MCP server");

  server
    .command("start")
    .description("Start the Tiqora MCP server")
    .option("-p, --port <port>", "Port to listen on", String(DEFAULT_PORT))
    .action(async (options: { port: string }) => {
      const port = parseInt(options.port, 10);

      if (isRunning()) {
        console.log(`Tiqora server is already running (PID ${readPid()})`);
        return;
      }

      const { startServer } = await import("@tiqora/server");

      writePid(process.pid);

      process.on("SIGTERM", () => {
        rmSync(PID_FILE, { force: true });
        process.exit(0);
      });
      process.on("SIGINT", () => {
        rmSync(PID_FILE, { force: true });
        process.exit(0);
      });

      await startServer(port);

      console.log(`✓ Tiqora MCP server running on http://localhost:${port}`);
      console.log(`  MCP endpoint: http://localhost:${port}/ws/{workspaceId}/mcp`);
      console.log(`  Status:       http://localhost:${port}/status`);
      console.log(`\nPress Ctrl+C to stop`);

      // Block until signal
      await new Promise<void>(() => {});
    });

  server
    .command("stop")
    .description("Stop the Tiqora MCP server")
    .action(() => {
      const pid = readPid();
      if (pid === null) {
        console.log("Tiqora server is not running");
        return;
      }
      try {
        process.kill(pid, "SIGTERM");
        rmSync(PID_FILE, { force: true });
        console.log("✓ Tiqora server stopped");
      } catch {
        console.error("Failed to stop server (process may have already exited)");
        rmSync(PID_FILE, { force: true });
      }
    });

  server
    .command("status")
    .description("Show Tiqora MCP server status")
    .action(async () => {
      const pid = readPid();
      if (pid === null) {
        console.log("Tiqora server is not running");
        console.log(`  Start it with: tiqora server start`);
        return;
      }

      try {
        const res = await fetch(`http://localhost:${DEFAULT_PORT}/status`);
        const data = (await res.json()) as {
          status: string;
          uptime: number;
          workspaces: Array<{ id: string; name: string; repos: number }>;
        };

        console.log(`✓ Tiqora server running (PID ${pid})`);
        console.log(`  Uptime: ${data.uptime}s`);
        console.log(`  Port:   ${DEFAULT_PORT}`);

        if (data.workspaces.length === 0) {
          console.log(`  Workspaces: none (create one in Tiqora Desktop)`);
        } else {
          console.log(`  Workspaces (${data.workspaces.length}):`);
          for (const w of data.workspaces) {
            console.log(`    • ${w.name} [${w.id}] — ${w.repos} repo(s)`);
            console.log(`      MCP: http://localhost:${DEFAULT_PORT}/ws/${w.id}/mcp`);
          }
        }
      } catch {
        console.log(`  Server process exists (PID ${pid}) but HTTP not responding`);
        console.log(`  The server may still be starting up`);
      }
    });
}

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    process.kill(pid, 0); // throws if process doesn't exist
    return pid;
  } catch {
    rmSync(PID_FILE, { force: true });
    return null;
  }
}

function writePid(pid: number): void {
  mkdirSync(PID_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(pid), "utf-8");
}

function isRunning(): boolean {
  return readPid() !== null;
}
