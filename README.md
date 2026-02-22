# Tiqora

Agentic delivery CLI for solo developers: challenge ticket quality, orchestrate PM/SM/Dev flows, and keep execution traceable with minimal overhead.

## Status

`0.0.1-dev` preview.

What is production-ready today:

- CLI bootstrap and installation flow (`init`, `install`)
- Multi-environment command deployment (Codex, Cursor, Claude Code, or manual path)
- Runtime workspace bootstrap (`.tiqora/`) and workflow engine copy (`_tiqora/`)
- Implemented execution workflow: `dev-story`

## Why Tiqora

Tiqora is built for developers who want to stay in coding flow while keeping project hygiene:

- clear ticket challenge gate before coding
- explicit persona orchestration (PM for challenge, Dev for implementation)
- branch/run traceability in local artifacts
- PM-tool-aware setup (Jira MCP wiring when selected)

## Prerequisites

- Node.js `>=20`

## Install (npm dev tag)

In any target repository:

```bash
npx @tiqora/tiqora@dev --version
```

Initialize Tiqora:

```bash
npx @tiqora/tiqora@dev init
```

Redeploy/update prompts and runtime assets:

```bash
npx @tiqora/tiqora@dev install
```

Use `-f` to overwrite existing command files without prompt:

```bash
npx @tiqora/tiqora@dev init -f
npx @tiqora/tiqora@dev install -f
```

## Install (from source)

```bash
git clone git@github.com:Tiqora/tiqora.git
cd tiqora
npm install
npm run build
npm link
tiqora --version
```

If you do not want to link globally:

```bash
npm run build
node dist/index.cjs --version
```

## Quick Start

In the target repository where you want Tiqora:

```bash
npx @tiqora/tiqora@dev init
```

`init` does the following:

1. asks for PM tool (`jira`, `gitlab`, `none`), git host, and branch pattern
2. asks for user/language defaults
3. creates/updates:
   - project config: `.tiqora.yaml`
   - user profile: `~/.tiqora/config.yaml`
4. deploys prompt commands to detected environments
5. creates local workspace folders under `.tiqora/`
6. copies runtime assets under `_tiqora/`

To redeploy/update prompts and runtime assets later:

```bash
npx @tiqora/tiqora@dev install
```

Use `-f` to overwrite existing command files without prompt:

```bash
npx @tiqora/tiqora@dev init -f
npx @tiqora/tiqora@dev install -f
```

## Generated Command Files

Tiqora installs these command templates into your AI environment command folder:

- `tiq-agent-dev.md`
- `tiq-agent-sm.md`
- `tiq-agent-pm.md`
- `tiq-workflow-create-story.md`
- `tiq-workflow-dev-story.md`
- `tiq-workflow-fetch-project-context.md`
- `tiq-workflow-create-ticket.md`

Supported auto-detected targets:

- Codex: `.codex/prompts`
- Cursor: `.cursor/commands`
- Claude Code: `.claude/commands`

## Config

Project config (`.tiqora.yaml`, required):

```yaml
pm_tool: jira
git_host: github
branch_pattern: 'feature/{ticket}'
jira:
  project_key: PROJ
  board_id: '123'
```

User profile (`~/.tiqora/config.yaml`, optional base):

```yaml
user_name: 'Developer'
idle_threshold_minutes: 15
communication_language: 'fr'
document_language: 'fr'
```

Effective runtime config = global profile (base) + project config (override).

## Dev Story Workflow

Current implemented workflow: `_tiqora/workflows/4-implementation/dev-story`.

High-level behavior:

1. load and validate effective config
2. resolve ticket context (via PM MCP when configured)
3. run mandatory PM challenge gate
4. block implementation if ticket quality is insufficient
5. create/switch branch and persist run state
6. execute implementation with test-first discipline
7. validate DoD checklist and finalize status

Persona behavior in this workflow:

- PM persona is explicitly loaded for challenge
- Dev persona is explicitly loaded for implementation
- original entry persona is restored for final status communication

Artifacts are persisted under:

- `.tiqora/state/active-run.json`
- `.tiqora/workflows/runs/`
- `.tiqora/workflows/steps/`

## Limitations (Current Dev Version)

- Only `dev-story` is fully implemented in `_tiqora/workflows/...`
- `create-story`, `create-ticket`, `fetch-project-context` command files are present, but corresponding runtime workflows are not yet fully shipped in this repo version

## Development

```bash
npm run build
npm test
```
