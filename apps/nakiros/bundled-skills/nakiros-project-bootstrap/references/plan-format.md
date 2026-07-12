# Plan format — strict

`plan.json` is the single source of truth you produce and revise. It must
parse as the shared `ProjectBootstrapPlan` TypeScript type
(`packages/shared/src/types/project-bootstrap.ts`) — write it as plain JSON,
field names exactly as below, no extra keys.

## Top-level shape

```json
{
  "projectId": "<copied verbatim from dot-claude-snapshot.json>",
  "projectPath": "<copied verbatim from dot-claude-snapshot.json>",
  "generatedAt": "<ISO-8601, bump on every write>",
  "summary": "<2-4 sentence cross-entity narrative — why these proposals as a set>",
  "usedFrictionDigests": false,
  "proposals": []
}
```

- `usedFrictionDigests` — `true` only if `friction-digests.json` (at the root
  of your working directory) existed and actually influenced at least one
  proposal. `false` when the plan came from codebase + snapshot alone (this
  is the expected common case and is not a lesser plan — see decision §4 in
  the feature doc).
- `summary` — write it like the opening paragraph of a design review: what
  ties these proposals together (e.g. "Two independently-owned apps in a
  pnpm monorepo justify a subagent split; permissions mirror the 4 scripts
  actually wired in CI; no hooks or MCP servers are grounded yet.").

## One proposal object

```json
{
  "id": "<artifactType>:<target>",
  "artifactType": "rules",
  "target": "frontend-conventions.md",
  "title": "Add frontend-conventions.md rule",
  "rationale": "apps/frontend/src/**/*.tsx uses a component-per-file convention with colocated *.module.css — this only matters when those paths are touched, not in every conversation.",
  "content": "---\ndescription: Component + styling conventions for apps/frontend\npaths:\n  - \"apps/frontend/src/**/*.tsx\"\n  - \"apps/frontend/src/**/*.module.css\"\n---\n\n# Frontend conventions\n\n...",
  "status": "pending"
}
```

- `id` — `"<artifactType>:<target>"`, unique within the plan, stable across
  revisions (the UI keys list items off it — never regenerate an id for an
  unchanged proposal).
- `status` — always `"pending"` on first write. Only flip to `"rejected"` /
  back to `"pending"` yourself during a discussion turn (see SKILL.md).
  Never write `"accepted"`, `"written"`, or `"failed"` — those are set by
  the UI / runner, not by you.
- `content` — the **full, ready-to-write** artefact body. See the
  per-`artifactType` convention below. Always a JSON string (escape
  newlines), never a nested object.
- Do not include `editedAt`, `writtenPath`, or `error` — those are added
  later by the runner/UI, never by you.

## `artifactType` × `target` × `content` convention

This table is the exact handoff contract the (not-yet-built) bootstrap
runner will use to dispatch each accepted proposal to its sister expert.
Follow it precisely — it mirrors the `*RunTarget` shapes already defined in
`packages/shared/src/types/agent-run.ts`.

| `artifactType` | `target` | `content` is... | Mirrors |
|---|---|---|---|
| `claudemd` | always `"root"` (only the project-root CLAUDE.md is supported) | Full markdown body, no frontmatter | `ClaudeMdRunTarget` |
| `rules` | relative filename under `.claude/rules/`, **with** `.md`, may include a subfolder (e.g. `"backend/runners.md"`) | Full markdown file including the `paths:`/`description:` frontmatter block | `RulesRunTarget.ruleName` |
| `subagent` | relative filename under `.claude/agents/`, **with** `.md` (e.g. `"backend.md"`) | Full markdown file including `name:`/`description:`/`tools:` frontmatter | `SubagentsRunTarget.subagentName` |
| `hook` | always `"singleton"` (one hooks block per project) | A JSON string of just the `hooks` object to merge into `.claude/settings.json` (e.g. `"{\"Stop\":[...]}"`)  | `HooksRunTarget` |
| `permission` | `"project"` or `"local"` — which settings file | A JSON string of just the `permissions` object (e.g. `"{\"allow\":[...],\"deny\":[...]}"`) | `PermissionsRunTarget.scope` (`PermissionsExpertScope`) |
| `mcp` | always `"singleton"` (one `.mcp.json` per project) | A JSON string of the **entire** `.mcp.json` file content | `McpRunTarget` |
| `output-style` | relative filename under `.claude/output-styles/`, **with** `.md` | Full markdown file including frontmatter | `OutputStylesRunTarget.styleName` |
| `skill` | — | — | **Not used in v1** — see Gotchas in SKILL.md |

**`artifactType` is exactly the 8-value `RecommendationArtifactType` enum —
`rules` (plural) but `subagent`/`hook`/`permission`/`output-style` (singular,
`output-style` hyphenated), `claudemd`, `mcp`, `skill`. Do not pluralise
`subagent`/`hook` to match their target directories (`.claude/agents/`,
the `hooks` block) — the enum token and the directory name intentionally
differ; copy the enum token verbatim from `RecommendationArtifactType`.

## Common mistakes to avoid

- **Nested JSON instead of a string for `content`.** Hooks/permissions/mcp
  `content` is always a JSON **string**, never an inline object — the
  downstream writer parses it, and it must round-trip through the same
  `content: string` field as markdown proposals.
- **Wrong `target` casing/extension.** Rules/subagents/output-styles always
  include the `.md` extension in `target`; hooks/mcp use the literal string
  `"singleton"`; claudemd uses the literal string `"root"`; permission uses
  exactly `"project"` or `"local"`.
- **Regenerating `id` across turns.** Breaks the UI's list reconciliation.
  Only change an `id` if you are genuinely replacing one proposal with an
  unrelated one (rare) — prefer editing the existing proposal in place.
- **Proposing without evidence.** Every `rationale` must point at something
  real (file path, script name, snapshot fact, friction excerpt). See
  `references/entity-heuristics.md`.
