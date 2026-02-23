import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  TIQORA_WORKSPACE_DIRECTORIES,
  bootstrapTiqoraWorkspace,
  COMMAND_TEMPLATE_FILES,
  deployTiqoraRuntimeAssets,
  deployCommandTemplates,
  patchGitignoreWithTiqora,
  resolveTemplateSourceDir
} from "../../src/utils/file-ops.js";

const PRIMARY_COMMAND_FILE = COMMAND_TEMPLATE_FILES[0];
const SECONDARY_COMMAND_FILE = COMMAND_TEMPLATE_FILES[1];
const TERTIARY_COMMAND_FILE = COMMAND_TEMPLATE_FILES[2];

function writeTemplateSet(templateDir: string): void {
  mkdirSync(templateDir, { recursive: true });

  for (const fileName of COMMAND_TEMPLATE_FILES) {
    writeFileSync(resolve(templateDir, fileName), `template:${fileName}\n`, "utf8");
  }
}

describe("file deployment utilities", () => {
  it("copies all command templates to a fresh target directory", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(sandbox, "repo", ".claude", "commands");
    writeTemplateSet(templateDir);

    const summary = await deployCommandTemplates({
      selectedTargets: [{ targetPath: targetDir }],
      templateSourceDir: templateDir,
      force: false
    });

    expect(summary.deployedTargets).toEqual([targetDir]);
    expect(summary.filesCopied).toHaveLength(COMMAND_TEMPLATE_FILES.length);
    expect(summary.filesOverwritten).toHaveLength(0);
    expect(summary.filesSkipped).toHaveLength(0);

    for (const fileName of COMMAND_TEMPLATE_FILES) {
      expect(readFileSync(resolve(targetDir, fileName), "utf8")).toBe(`template:${fileName}\n`);
    }

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("skips overwrite when file exists and confirmation is declined", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(sandbox, "repo", ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "custom command\n", "utf8");

    const confirmOverwrite = vi.fn(async () => false);
    const summary = await deployCommandTemplates({
      selectedTargets: [{ targetPath: targetDir }],
      templateSourceDir: templateDir,
      force: false,
      confirmOverwrite
    });

    expect(confirmOverwrite).toHaveBeenCalledTimes(1);
    expect(readFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "utf8")).toBe("custom command\n");
    expect(summary.filesSkipped).toEqual([resolve(targetDir, PRIMARY_COMMAND_FILE)]);
    expect(summary.filesOverwritten).toEqual([]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("overwrites when file exists and confirmation is accepted", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(sandbox, "repo", ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "custom command\n", "utf8");

    const confirmOverwrite = vi.fn(async () => true);
    const summary = await deployCommandTemplates({
      selectedTargets: [{ targetPath: targetDir }],
      templateSourceDir: templateDir,
      force: false,
      confirmOverwrite
    });

    expect(confirmOverwrite).toHaveBeenCalledTimes(1);
    expect(readFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "utf8")).toBe(
      `template:${PRIMARY_COMMAND_FILE}\n`
    );
    expect(summary.filesOverwritten).toEqual([resolve(targetDir, PRIMARY_COMMAND_FILE)]);
    expect(summary.filesSkipped).toEqual([]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("overwrites existing files without prompting when force=true", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(sandbox, "repo", ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "custom command\n", "utf8");

    const confirmOverwrite = vi.fn(async () => false);
    const summary = await deployCommandTemplates({
      selectedTargets: [{ targetPath: targetDir }],
      templateSourceDir: templateDir,
      force: true,
      confirmOverwrite
    });

    expect(confirmOverwrite).not.toHaveBeenCalled();
    expect(readFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "utf8")).toBe(
      `template:${PRIMARY_COMMAND_FILE}\n`
    );
    expect(summary.filesOverwritten).toEqual([resolve(targetDir, PRIMARY_COMMAND_FILE)]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("asks overwrite once and applies the same decision to all existing command files", async () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const templateDir = resolve(sandbox, "templates", "commands");
    const targetDir = resolve(sandbox, "repo", ".claude", "commands");
    writeTemplateSet(templateDir);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "custom one\n", "utf8");
    writeFileSync(resolve(targetDir, SECONDARY_COMMAND_FILE), "custom two\n", "utf8");
    writeFileSync(resolve(targetDir, TERTIARY_COMMAND_FILE), "custom three\n", "utf8");

    const confirmOverwrite = vi.fn(async () => true);
    const summary = await deployCommandTemplates({
      selectedTargets: [{ targetPath: targetDir }],
      templateSourceDir: templateDir,
      force: false,
      confirmOverwrite
    });

    expect(confirmOverwrite).toHaveBeenCalledTimes(1);
    expect(readFileSync(resolve(targetDir, PRIMARY_COMMAND_FILE), "utf8")).toBe(
      `template:${PRIMARY_COMMAND_FILE}\n`
    );
    expect(readFileSync(resolve(targetDir, SECONDARY_COMMAND_FILE), "utf8")).toBe(
      `template:${SECONDARY_COMMAND_FILE}\n`
    );
    expect(readFileSync(resolve(targetDir, TERTIARY_COMMAND_FILE), "utf8")).toBe(
      `template:${TERTIARY_COMMAND_FILE}\n`
    );
    expect(summary.filesOverwritten).toEqual([
      resolve(targetDir, PRIMARY_COMMAND_FILE),
      resolve(targetDir, SECONDARY_COMMAND_FILE),
      resolve(targetDir, TERTIARY_COMMAND_FILE)
    ]);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("creates .gitignore when absent and appends .tiqora/ once", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const firstPatch = patchGitignoreWithTiqora({ projectRoot: repoRoot });
    const secondPatch = patchGitignoreWithTiqora({ projectRoot: repoRoot });

    const gitignorePath = resolve(repoRoot, ".gitignore");
    expect(firstPatch).toBe(true);
    expect(secondPatch).toBe(false);
    expect(readFileSync(gitignorePath, "utf8")).toBe(".tiqora/\n");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("patches existing .gitignore idempotently while preserving existing lines", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    mkdirSync(repoRoot, { recursive: true });
    const gitignorePath = resolve(repoRoot, ".gitignore");
    writeFileSync(gitignorePath, "node_modules/\r\n# Keep logs\nlogs/\r\n", "utf8");

    const firstPatch = patchGitignoreWithTiqora({ projectRoot: repoRoot });
    const secondPatch = patchGitignoreWithTiqora({ projectRoot: repoRoot });
    const lines = readFileSync(gitignorePath, "utf8").split("\n");

    expect(firstPatch).toBe(true);
    expect(secondPatch).toBe(false);
    expect(lines).toContain("node_modules/");
    expect(lines).toContain("# Keep logs");
    expect(lines).toContain("logs/");
    expect(lines.filter((line) => line === ".tiqora/")).toHaveLength(1);
    expect(readFileSync(gitignorePath, "utf8")).toContain("\n");

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("creates the canonical .tiqora workspace structure idempotently", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    mkdirSync(repoRoot, { recursive: true });

    const first = bootstrapTiqoraWorkspace({ projectRoot: repoRoot });
    const second = bootstrapTiqoraWorkspace({ projectRoot: repoRoot });

    expect(first.directoriesCreated.length).toBe(TIQORA_WORKSPACE_DIRECTORIES.length);
    expect(second.directoriesCreated).toEqual([]);

    for (const relativeDir of TIQORA_WORKSPACE_DIRECTORIES) {
      expect(existsSync(resolve(repoRoot, ".tiqora", relativeDir))).toBe(true);
    }

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("does not migrate legacy .timetracker artifacts", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    const legacyRoot = resolve(repoRoot, ".timetracker");
    const workspaceRoot = resolve(repoRoot, ".tiqora");
    mkdirSync(resolve(legacyRoot, "sessions"), { recursive: true });
    writeFileSync(
      resolve(legacyRoot, "sessions", "2026-02-20-EX-201.json"),
      '{"ticketId":"EX-201"}\n',
      "utf8"
    );

    const summary = bootstrapTiqoraWorkspace({ projectRoot: repoRoot });

    expect(summary.directoriesCreated).toContain(".tiqora/sessions");
    expect(existsSync(resolve(workspaceRoot, "sessions", "2026-02-20-EX-201.json"))).toBe(false);

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("deploys _tiqora runtime assets and respects force overwrite", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    const runtimeSourceDir = resolve(sandbox, "runtime", "_tiqora");
    const sourceWorkflowEngine = resolve(runtimeSourceDir, "core", "tasks", "workflow.xml");
    const sourceWorkflowYaml = resolve(
      runtimeSourceDir,
      "workflows",
      "4-implementation",
      "dev-story",
      "workflow.yaml"
    );

    mkdirSync(resolve(runtimeSourceDir, "core", "tasks"), { recursive: true });
    mkdirSync(resolve(runtimeSourceDir, "workflows", "4-implementation", "dev-story"), {
      recursive: true
    });
    writeFileSync(sourceWorkflowEngine, "<workflow-engine/>\n", "utf8");
    writeFileSync(sourceWorkflowYaml, "name: dev-story\n", "utf8");

    mkdirSync(resolve(repoRoot, "_tiqora", "core", "tasks"), { recursive: true });
    writeFileSync(resolve(repoRoot, "_tiqora", "core", "tasks", "workflow.xml"), "legacy\n", "utf8");

    const first = deployTiqoraRuntimeAssets({
      projectRoot: repoRoot,
      runtimeSourceDir,
      force: false
    });
    expect(first.sourceFound).toBe(true);
    expect(first.filesCopied).toContain("_tiqora/workflows/4-implementation/dev-story/workflow.yaml");
    expect(first.filesSkipped).toContain("_tiqora/core/tasks/workflow.xml");
    expect(readFileSync(resolve(repoRoot, "_tiqora", "core", "tasks", "workflow.xml"), "utf8")).toBe(
      "legacy\n"
    );

    const second = deployTiqoraRuntimeAssets({
      projectRoot: repoRoot,
      runtimeSourceDir,
      force: true
    });
    expect(second.filesOverwritten).toContain("_tiqora/core/tasks/workflow.xml");
    expect(readFileSync(resolve(repoRoot, "_tiqora", "core", "tasks", "workflow.xml"), "utf8")).toBe(
      "<workflow-engine/>\n"
    );

    rmSync(sandbox, { recursive: true, force: true });
  });

  it("resolves template source from real argv entry path when binary is symlinked", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    const packageRoot = resolve(sandbox, ".npx", "node_modules", "@tiqora", "tiqora");
    const templateDir = resolve(packageRoot, "templates", "commands");
    const distEntryPath = resolve(packageRoot, "dist", "index.cjs");
    const binPath = resolve(repoRoot, "node_modules", ".bin", "tiqora");
    const originalArgv1 = process.argv[1];

    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(resolve(packageRoot, "dist"), { recursive: true });
    mkdirSync(resolve(repoRoot, "node_modules", ".bin"), { recursive: true });
    writeTemplateSet(templateDir);
    writeFileSync(distEntryPath, "console.log('tiqora');\n", "utf8");
    symlinkSync(distEntryPath, binPath);

    process.argv[1] = binPath;
    try {
      const resolvedSourceDir = resolveTemplateSourceDir(repoRoot);
      expect(resolvedSourceDir).toBe(realpathSync(templateDir));
    } finally {
      process.argv[1] = originalArgv1;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("auto-detects runtime source from real argv entry path when binary is symlinked", () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "tiqora-fileops-unit-"));
    const repoRoot = resolve(sandbox, "repo");
    const packageRoot = resolve(sandbox, ".npx", "node_modules", "@tiqora", "tiqora");
    const runtimeSourceDir = resolve(packageRoot, "_tiqora");
    const runtimeEnginePath = resolve(runtimeSourceDir, "core", "tasks", "workflow.xml");
    const distEntryPath = resolve(packageRoot, "dist", "index.cjs");
    const binPath = resolve(repoRoot, "node_modules", ".bin", "tiqora");
    const originalArgv1 = process.argv[1];

    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(resolve(packageRoot, "dist"), { recursive: true });
    mkdirSync(resolve(repoRoot, "node_modules", ".bin"), { recursive: true });
    mkdirSync(resolve(runtimeSourceDir, "core", "tasks"), { recursive: true });
    writeFileSync(runtimeEnginePath, "<workflow-engine/>\n", "utf8");
    writeFileSync(distEntryPath, "console.log('tiqora');\n", "utf8");
    symlinkSync(distEntryPath, binPath);

    process.argv[1] = binPath;
    try {
      const summary = deployTiqoraRuntimeAssets({
        projectRoot: repoRoot
      });

      expect(summary.sourceFound).toBe(true);
      expect(summary.sourcePath).toBe(realpathSync(runtimeSourceDir));
      expect(summary.filesCopied).toContain("_tiqora/core/tasks/workflow.xml");
      expect(readFileSync(resolve(repoRoot, "_tiqora", "core", "tasks", "workflow.xml"), "utf8")).toBe(
        "<workflow-engine/>\n"
      );
    } finally {
      process.argv[1] = originalArgv1;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
