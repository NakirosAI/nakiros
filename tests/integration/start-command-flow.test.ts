import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TEMPLATE_DIR = resolve(process.cwd(), "templates", "commands");
const WORKFLOW_DEV_STORY_PATH = resolve(TEMPLATE_DIR, "tiq-workflow-dev-story.md");
const WORKFLOW_DEV_STORY_YAML_PATH = resolve(
  process.cwd(),
  "_tiqora",
  "workflows",
  "4-implementation",
  "dev-story",
  "workflow.yaml"
);
const WORKFLOW_DEV_STORY_INSTRUCTIONS_PATH = resolve(
  process.cwd(),
  "_tiqora",
  "workflows",
  "4-implementation",
  "dev-story",
  "instructions.xml"
);
const AGENTS_DIR = resolve(process.cwd(), "_tiqora", "agents");
const AGENT_DEV_PATH = resolve(AGENTS_DIR, "dev.md");
const AGENT_SM_PATH = resolve(AGENTS_DIR, "sm.md");
const AGENT_PM_PATH = resolve(AGENTS_DIR, "pm.md");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("integration: namespaced tiq command workflow contract", () => {
  it("defines /tiq:workflow:dev-story trigger in workflow launcher template", () => {
    const content = read(WORKFLOW_DEV_STORY_PATH);
    expect(content).toContain("Command Trigger: `/tiq:workflow:dev-story`");
    expect(content).toContain("@_tiqora/core/tasks/workflow.xml");
    expect(content).toContain("_tiqora/workflows/4-implementation/dev-story/workflow.yaml");
  });

  it("documents strict config-first discovery before PM or git actions in instructions", () => {
    const yamlContent = read(WORKFLOW_DEV_STORY_YAML_PATH);
    const instructions = read(WORKFLOW_DEV_STORY_INSTRUCTIONS_PATH);

    expect(yamlContent).toContain("project_config: \"{project-root}/.tiqora.yaml\"");
    expect(yamlContent).toContain("profile_config: \"~/.tiqora/config.yaml\"");
    expect(instructions).toContain("Load and merge tiqora configuration");
    expect(instructions).toContain("Validate required project keys: pm_tool, git_host, branch_pattern");
    expect(instructions).toContain("communication_language");
    expect(instructions).toContain("document_language");

    const configStepIndex = instructions.indexOf("<step n=\"1\" goal=\"Load and merge tiqora configuration\">");
    const ticketStepIndex = instructions.indexOf("<step n=\"3\" goal=\"Resolve ticket context\">");
    const gitStepIndex = instructions.indexOf("<step n=\"5\" goal=\"Create/switch branch and persist run state\">");
    expect(configStepIndex).toBeGreaterThan(-1);
    expect(ticketStepIndex).toBeGreaterThan(-1);
    expect(gitStepIndex).toBeGreaterThan(-1);
    expect(configStepIndex).toBeLessThan(ticketStepIndex);
    expect(configStepIndex).toBeLessThan(gitStepIndex);
  });

  it("enforces mandatory CHALLENGE gate before branching and implementation in instructions", () => {
    const instructions = read(WORKFLOW_DEV_STORY_INSTRUCTIONS_PATH);

    expect(instructions).toContain("Run mandatory challenge gate");
    expect(instructions).toContain("No implementation starts before challenge is passed.");
    expect(instructions).toContain("Run a PM-quality challenge on the current ticket before implementation");
    expect(instructions).toContain("[CHALLENGE] clarity passed — ready for implementation");
    expect(instructions).toContain(
      "Provide clarifications to remove ambiguity before implementation proceeds."
    );
    expect(instructions).not.toContain("skip-challenge");

    const ticketStepIndex = instructions.indexOf("<step n=\"3\" goal=\"Resolve ticket context\">");
    const challengeStepIndex = instructions.indexOf(
      "<step n=\"4\" goal=\"Run mandatory challenge gate\">"
    );
    const branchStepIndex = instructions.indexOf(
      "<step n=\"5\" goal=\"Create/switch branch and persist run state\">"
    );

    expect(ticketStepIndex).toBeGreaterThan(-1);
    expect(challengeStepIndex).toBeGreaterThan(-1);
    expect(branchStepIndex).toBeGreaterThan(-1);
    expect(ticketStepIndex).toBeLessThan(challengeStepIndex);
    expect(challengeStepIndex).toBeLessThan(branchStepIndex);
  });

  it("requires PM MCP ticket retrieval when a ticket ID is provided", () => {
    const instructions = read(WORKFLOW_DEV_STORY_INSTRUCTIONS_PATH);

    expect(instructions).toContain(
      "If a ticket ID is provided, retrieve the ticket via configured PM MCP connector before challenge/implementation."
    );
    expect(instructions).toContain("Ticket retrieval failed. Retry MCP fetch or continue in standalone short-description mode?");
    expect(instructions).toContain("(retry/standalone)");
  });

  it("documents concise workflow state outputs instead of verbose traces", () => {
    const instructions = read(WORKFLOW_DEV_STORY_INSTRUCTIONS_PATH);

    expect(instructions).toContain("[WORKFLOW] dev-story started");
    expect(instructions).toContain("[WORKFLOW] dev-story initialized");
    expect(instructions).toContain("[WORKFLOW] dev-story completed");
    expect(instructions).toContain("Do not report \"completed\" until all implementation and validation activities are truly finished.");
  });

  it("keeps template command triggers fully namespaced", () => {
    const templateFiles = readdirSync(TEMPLATE_DIR).filter((file) => file.endsWith(".md"));
    const templateContents = templateFiles.map((file) => read(resolve(TEMPLATE_DIR, file)));

    for (const content of templateContents) {
      expect(content).toContain("Command Trigger: `/tiq:");
      expect(content).not.toContain("Legacy Product Alias");
      expect(content).not.toContain("!tiq-");
      expect(content).not.toContain("/tiq-start");
    }
  });

  it("includes required namespaced commands in template set", () => {
    const templateFiles = readdirSync(TEMPLATE_DIR).filter((file) => file.endsWith(".md"));

    expect(templateFiles).toEqual(
      expect.arrayContaining([
        "tiq-agent-dev.md",
        "tiq-agent-sm.md",
        "tiq-agent-pm.md",
        "tiq-workflow-create-story.md",
        "tiq-workflow-dev-story.md",
        "tiq-workflow-fetch-project-context.md",
        "tiq-workflow-create-ticket.md"
      ])
    );
  });

  it("wires /tiq:agent commands to dedicated _tiqora agent definitions", () => {
    const devTemplate = read(resolve(TEMPLATE_DIR, "tiq-agent-dev.md"));
    const smTemplate = read(resolve(TEMPLATE_DIR, "tiq-agent-sm.md"));
    const pmTemplate = read(resolve(TEMPLATE_DIR, "tiq-agent-pm.md"));

    expect(devTemplate).toContain("@_tiqora/agents/dev.md");
    expect(smTemplate).toContain("@_tiqora/agents/sm.md");
    expect(pmTemplate).toContain("@_tiqora/agents/pm.md");
    expect(devTemplate).toContain("@_tiqora/core/tasks/workflow.xml");
    expect(smTemplate).toContain("@_tiqora/core/tasks/workflow.xml");
    expect(pmTemplate).toContain("@_tiqora/core/tasks/workflow.xml");
  });

  it("defines dev, sm, and pm agent files under _tiqora/agents", () => {
    const devAgent = read(AGENT_DEV_PATH);
    const smAgent = read(AGENT_SM_PATH);
    const pmAgent = read(AGENT_PM_PATH);

    expect(devAgent).toContain("<agent id=\"tiqora.dev.agent\"");
    expect(smAgent).toContain("<agent id=\"tiqora.sm.agent\"");
    expect(pmAgent).toContain("<agent id=\"tiqora.pm.agent\"");
    expect(devAgent).toContain("{project-root}/_tiqora/core/tasks/workflow.xml");
    expect(smAgent).toContain("{project-root}/_tiqora/core/tasks/workflow.xml");
    expect(pmAgent).toContain("{project-root}/_tiqora/core/tasks/workflow.xml");
    expect(devAgent).toContain("<operational-reflexes>");
    expect(smAgent).toContain("<operational-reflexes>");
    expect(pmAgent).toContain("<operational-reflexes>");
    expect(devAgent).toContain(".tiqora/sync/queue.json");
    expect(smAgent).toContain(".tiqora/sync/queue.json");
    expect(pmAgent).toContain(".tiqora/sync/queue.json");
    expect(devAgent).toContain("create/switch branch");
    expect(smAgent).toContain("MR context");
    expect(pmAgent).toContain("ticket operations");
  });
});
