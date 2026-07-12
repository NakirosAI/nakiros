# Module — Hestia

> Ἑστία, *hearth*. Configuration of the agent's home.

## Scope

Configure the agent's "home" directory: `.claude` today, `.codex` / `.cursor`
next. Covers CLAUDE.md, rules, subagents, hooks, permissions, MCP, output-styles
— each with the canonical audit / fix / eval lifecycle.

Beyond editing an existing config, Hestia can **bootstrap from a conversation**:
start a project with no code, and let a guided discussion produce the right
config from the start.

## Capabilities

- `consumes`: `recommendation.consumer:{claudemd, rules, subagent, hook,
  permission, mcp, output-style}` — applies Argos cards for every config
  artefact type.
- `provides`: (none yet)

## Screens (front)

`ClaudeMdScreen`, `RulesScreen`, `HooksScreen`, `McpScreen`,
`PermissionsScreen`, `OutputStylesScreen`, `SubagentsScreen` (and their
subfolders), `Onboarding`, `CreateEntityModal`. All on the `@nakirosai/ui`
`LifecycleScreen` scaffold — this is the screen family the scaffold was modelled
on.

## Backend services

`claude-{md,rules,hooks,mcp,permissions,output-styles,agents}-writer`,
`{hooks,mcp,permissions}-writer`, all `*-audit-history`,
`dot-claude-snapshot-builder`, `onboarding-installer`, `path-suggester`.

## Bundled skills

The `.claude` experts: `nakiros-claudemd-expert`, `-rules-expert`,
`-subagents-expert`, `-hooks-expert`, `-permissions-expert`, `-mcp-expert`,
`-output-styles-expert`. These are skills, run through the shared runner — Hestia
is "runner + its skills + its screens", not special code.

## IPC namespace

`hestia:*` (handlers: the 7 `claude-*`, hooks, mcp, permissions, rules,
output-styles, subagents, onboarding, create, edit).

## Detailed design

See [`hestia-design.md`](hestia-design.md). Key resolved decisions:

- **One artefact per provider** — no shared canonical content. `.claude` and
  `.cursor` artefacts coexist independently (grounded in real usage: both folders
  already live side by side in the project).
- Shared artefact taxonomy + per-provider **capability matrix** + per-provider
  **adapters** + shared `LifecycleScreen` scaffold.
- One expert per artefact type, **provider-aware** (no N×M skills).
- v1: Claude live; Cursor next; conversation-driven bootstrap targets a chosen
  provider.
