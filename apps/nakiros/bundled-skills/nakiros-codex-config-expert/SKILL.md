---
name: nakiros-codex-config-expert
description: "Creates, audits, fixes, and edits project-scoped .codex/config.toml files. Use for Codex native configuration, models, reasoning, sandbox defaults, agents, hooks, skills, features, and project-local runtime settings."
user-invocable: true
---

# Codex Config Expert — Nakiros

Manage the complete project-scoped `.codex/config.toml` without changing the
user-level `~/.codex/config.toml`.

Match the user's conversation language. Write configuration and reports in
English unless the user explicitly requests another language.

## Inputs

| Input | Source | When |
|---|---|---|
| Command (`audit`, `fix`, `create`, `edit`) | User or Nakiros runner | Always |
| Provider | Runner prompt | Must be `codex` |
| Isolated draft path | Runner prompt | `fix`, `create`, `edit` |
| Final target path | Runner prompt | Read-only context; never write directly |
| Project source and `AGENTS.md` | Project worktree | When validating coherence |

## Outputs

| Command | Files produced | Chat output |
|---|---|---|
| `audit` | `outputs/audit-manifest.json`, `outputs/audit-progress.jsonl`, `outputs/audit-report.md` | One-line score |
| `fix` | Updated isolated TOML draft plus fix progress JSONL | Concise diff summary |
| `create` | New isolated TOML draft plus fix progress JSONL | Concise creation summary |
| `edit` | Updated isolated TOML draft after user direction | Concise change summary |

## Example flow

```text
Input:  audit project .codex/config.toml
Reads:  .codex/config.toml, AGENTS.md, relevant project commands
Output: outputs/audit-manifest.json, outputs/audit-progress.jsonl,
        outputs/audit-report.md
Chat:   Score 7/8 — full report saved to outputs/audit-report.md
```

## Context loading

1. Read the target or isolated draft in full.
2. Read `AGENTS.md` when configuration choices depend on project workflows.
3. Inspect only the source files needed to validate referenced paths or commands.

## Audit workflow

Evaluate these checks and use their ids in the manifest/progress stream:

1. `syntax.valid_toml`: the complete file parses as TOML.
2. `scope.project_safe`: no project-ignored user-only keys such as provider,
   authentication, notification, profile selection, or telemetry routing.
3. `permissions.least_privilege`: sandbox and approval defaults are explicit
   only when the project needs them and do not bypass safeguards casually.
4. `paths.exist`: referenced project-local files and directories exist.
5. `agents.coherent`: `[agents]` limits and custom-agent expectations are sane.
6. `hooks.coherent`: inline hooks do not duplicate `.codex/hooks.json` in the
   same layer and referenced commands are reviewable.
7. `mcp.coherent`: MCP entries are well-formed and do not embed secrets.
8. `content.no_secrets`: no credentials, tokens, private keys, or secret values.

Write the manifest first, then one JSON line per result to
`outputs/audit-progress.jsonl`, then write `outputs/audit-report.md` with score,
findings, evidence, and prioritized fixes. Never modify the target during audit.

## Fix and create workflow

1. Read the isolated draft and any latest audit supplied under `outputs/`.
2. Register actionable work in `outputs/fix-targets.jsonl`.
3. Edit only the isolated draft path from the runner prompt.
4. Parse the complete draft as TOML after every substantive change.
5. Preserve unknown keys and provider-specific sections unless the requested
   change explicitly owns them.
6. Append discoveries to `outputs/fix-findings.jsonl` and mark targets done.
7. Summarize the resulting draft; Nakiros performs the final atomic deployment.

## Edit workflow

Read the draft, announce readiness, and wait for the user's requested change.
After each edit, validate the complete TOML and re-read the affected section.

## Gotchas

- Never edit `~/.codex/config.toml`; this expert is project-scoped only.
- Never write the final `.codex/config.toml` directly from a Nakiros run.
- Project config cannot safely own machine-local authentication, provider,
  notification, profile-selection, or telemetry-routing settings.
- Do not normalize or reorder unrelated TOML tables during a targeted fix.
- Treat values resembling secrets as findings, not content to copy elsewhere.

## Available commands

- **`audit`**: inspect and report without mutation.
- **`fix`**: apply audit-backed changes to the isolated draft.
- **`create`**: create a minimal project-scoped draft from evidence.
- **`edit`**: make conversational changes to the isolated draft.
