import { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { registerInitCommand } from "./commands/init.js";
import { registerInstallCommand } from "./commands/install.js";
import { registerServerCommand } from "./commands/server.js";
import { loadRuntimeConfigOrExit } from "./utils/config.js";

const cli = new Command();

cli.name("tiqora");
cli.description("Tiqora CLI scaffold");
cli.version(readPackageVersion(), "-v, --version", "output the current version");
registerInitCommand(cli);
registerInstallCommand(cli);
registerServerCommand(cli);

if (shouldLoadRuntimeConfig(process.argv.slice(2))) {
  loadRuntimeConfigOrExit();
}

cli.parse();

function readPackageVersion(): string {
  try {
    const packageJsonPath = resolve(process.cwd(), "package.json");
    const content = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(content) as { version?: string };

    if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
      return packageJson.version;
    }
  } catch {
    // Fall back to a sane default if package.json cannot be read.
  }

  return "0.1.0";
}

function shouldLoadRuntimeConfig(args: string[]): boolean {
  if (args.length === 0) {
    return false;
  }

  const bypassFlags = new Set(["-v", "--version", "-h", "--help"]);
  if (args.some((arg) => bypassFlags.has(arg))) {
    return false;
  }

  const firstCommand = args.find((arg) => !arg.startsWith("-"));
  const installerCommands = new Set(["init", "install", "server"]);
  if (firstCommand && installerCommands.has(firstCommand)) {
    return false;
  }

  return true;
}
