import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CLI --version", () => {
  it("prints the package version from built CJS entrypoint", () => {
    const repoRoot = resolve(__dirname, "..", "..");
    const distCjsPath = resolve(repoRoot, "dist", "index.cjs");
    const packageJsonPath = resolve(repoRoot, "package.json");

    expect(existsSync(distCjsPath)).toBe(true);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version: string;
    };

    const output = execFileSync(process.execPath, [distCjsPath, "--version"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();

    expect(output).toBe(packageJson.version);
  });
});
