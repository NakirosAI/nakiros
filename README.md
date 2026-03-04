# Nakiros

Agentic delivery CLI for solo developers: challenge ticket quality, orchestrate PM/SM/Dev flows, and keep execution traceable with minimal overhead.

## Status

`0.0.1-dev` preview.

What is production-ready today:

- CLI bootstrap and installation flow (`init`, `install`)
- Multi-environment command deployment (Codex, Cursor, Claude Code, or manual path)
- Runtime workspace bootstrap (`.nakiros/`) and workflow engine copy (`_nakiros/`)
- Implemented execution workflow: `dev-story`

## Why Nakiros

Nakiros is built for developers who want to stay in coding flow while keeping project hygiene:

- clear ticket challenge gate before coding
- explicit persona orchestration (PM for challenge, Dev for implementation)
- branch/run traceability in local artifacts
- PM-tool-aware setup (Jira MCP wiring when selected)

## Prerequisites

- Node.js `>=20`

## Install (npm dev tag)

In any target repository:

```bash
npx @nakiros/nakiros@dev --version
```

Initialize Nakiros:

```bash
npx @nakiros/nakiros@dev init
```

Redeploy/update prompts and runtime assets:

```bash
npx @nakiros/nakiros@dev install
```

Use `-f` to overwrite existing command files without prompt:

```bash
npx @nakiros/nakiros@dev init -f
npx @nakiros/nakiros@dev install -f
```

## Install (from source)

```bash
git clone git@github.com:Nakiros/nakiros.git
cd nakiros
npm install
npm run build
npm link
nak --version
```

If you do not want to link globally:

```bash
npm run build
node dist/index.cjs --version
```

## Quick Start

In the target repository where you want Nakiros:

```bash
npx @nakiros/nakiros@dev init
```

`init` does the following:

1. asks for PM tool (`jira`, `gitlab`, `none`), git host, and branch pattern
2. asks for user/language defaults
3. creates/updates:
   - project config: `.nakiros.yaml`
   - user profile: `~/.nakiros/config.yaml`
4. deploys prompt commands to detected environments
5. creates local workspace folders under `.nakiros/`
6. copies runtime assets under `_nakiros/`

To redeploy/update prompts and runtime assets later:

```bash
npx @nakiros/nakiros@dev install
```

Use `-f` to overwrite existing command files without prompt:

```bash
npx @nakiros/nakiros@dev init -f
npx @nakiros/nakiros@dev install -f
```

## Generated Command Files

Nakiros installs these command templates into your AI environment command folder:

- `nak-agent-dev.md`
- `nak-agent-sm.md`
- `nak-agent-pm.md`
- `nak-workflow-create-story.md`
- `nak-workflow-dev-story.md`
- `nak-workflow-fetch-project-context.md`
- `nak-workflow-create-ticket.md`

Supported auto-detected targets:

- Codex: `.codex/prompts`
- Cursor: `.cursor/commands`
- Claude Code: `.claude/commands`

## Config

Project config (`.nakiros.yaml`, required):

```yaml
pm_tool: jira
git_host: github
branch_pattern: 'feature/{ticket}'
jira:
  project_key: PROJ
  board_id: '123'
```

User profile (`~/.nakiros/config.yaml`, optional base):

```yaml
user_name: 'Developer'
idle_threshold_minutes: 15
communication_language: 'fr'
document_language: 'fr'
```

Effective runtime config = global profile (base) + project config (override).

## Dev Story Workflow

Current implemented workflow: `_nakiros/workflows/4-implementation/dev-story`.

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

- `.nakiros/state/active-run.json`
- `.nakiros/workflows/runs/`
- `.nakiros/workflows/steps/`

## Limitations (Current Dev Version)

- Only `dev-story` is fully implemented in `_nakiros/workflows/...`
- `create-story`, `create-ticket`, `fetch-project-context` command files are present, but corresponding runtime workflows are not yet fully shipped in this repo version

## Development

```bash
npm run build
npm test
```
