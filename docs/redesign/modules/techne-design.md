# Module — Techne (detailed design)

> Detailed design for [Techne](techne.md). Read [03-module-contract.md](../03-module-contract.md)
> and [05-inter-module-contracts.md](../05-inter-module-contracts.md) first.

## What Techne is

Standalone authoring of **Agent Skills**, decoupled from any project: create,
audit, evaluate, and improve skills without opening a codebase.

Two facts shape the whole design:

1. **Skills are one open standard** — [agentskills.io](https://agentskills.io)
   (originally Anthropic's Agent Skills, now an open standard adopted by Claude
   Code, Cursor, Codex, Gemini CLI, Copilot, OpenCode, and many more). *Build a
   skill once, use it across any skills-compatible agent.* The skill **content**
   is identical regardless of provider.
2. **The signature feature is decoupled creation**, not a marketplace. Today a
   skill is edited where it lives (a project's skills folder). Techne makes the
   skill a first-class artefact authored in its own library, independent of any
   project.

## The two layers

The one nuance: a skill's **content** is universal, but **where it is installed
is provider-specific** — Claude reads `.claude/skills/`, standard-adopting agents
read `.agents/skills/`, etc.

```
   ┌─────────────────────────────────────────────┐
   │  CONTENT — universal                         │
   │  SKILL.md + scripts/ + references/ + assets/ │  ← one source, agentskills.io
   │  lives in the Techne library (~/.nakiros/)   │     format, decoupled from projects
   └───────────────────────┬─────────────────────┘
              install = per-provider PLACEMENT (symlink / copy)
   ┌──────────────────┬────┴──────────────┬──────────────────┐
   ▼                  ▼                   ▼                  ▼
 .claude/skills/   ~/.claude/skills/   .agents/skills/   (Cursor / Codex
 (Claude, project) (Claude, global)    (standard, later)  → their dir, later)
```

| Layer | What | Provider-specific? |
|-------|------|--------------------|
| Source of truth | decoupled skill library under `~/.nakiros/` (versioned) | no — one format |
| Content | `SKILL.md` folder, agentskills.io standard | no |
| Placement / install | symlink/copy into the provider's skills dir + scope | **yes** — a per-provider location resolver |
| Lifecycle | create / audit / eval / improve, on the source | no |
| Eval | one methodology; execution via the provider's runner | execution yes, methodology no |

### Skill format (agentskills.io)

A skill is a folder:

```
my-skill/
├── SKILL.md      # required: name + description (frontmatter) + instructions
├── scripts/      # optional executable code
├── references/   # optional docs
└── assets/       # optional templates/resources
```

Progressive disclosure: discovery (name+description) → activation (full
SKILL.md) → execution. Techne authors and audits against this spec; the spec
**is** the model — there is no Techne-proprietary skill schema.

## Source of truth: the decoupled library

- Skills live in a **Techne library under `~/.nakiros/`** (versioned drafts).
- This is the decoupled authoring area — not tied to any project.
- Editing happens here; nothing is "in a project" until installed.

## Placement: the per-provider location resolver

Installing a skill places it where a target expects it. A small resolver per
provider maps `(provider, scope)` to a location:

| Provider | project scope | global scope |
|----------|---------------|--------------|
| Claude (v1) | `<repo>/.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| standard (later) | `<repo>/.agents/skills/<name>/` | `~/.agents/skills/<name>/` |
| Cursor / Codex (later) | their own dir | their own dir |

Mechanism: **symlink** from the library into each target — reusing the existing
`skill-symlink-override` service. Consequences:

- one source skill can be linked into several locations at once (e.g. both
  `.claude/skills` and `.agents/skills`) with **no duplication**,
- an edit in the library propagates to every linked location,
- "install into project / global / plugin" becomes choosing targets, not copying
  files around.

Reuses existing code: `skill-fs`, `skill-reader`, `bundled-skills-{reader,sync}`,
`plugin-skills-reader`, `claude-global-skills-reader`, `skill-symlink-override`.

## Lifecycle

`create / audit / eval / improve` on the library source, all through the shared
`LifecycleScreen` scaffold and the shared runner. This is today's Skill screen,
re-homed into Techne and pointed at the decoupled library instead of a project.

## Eval

- **Methodology is universal** — scenarios, LLM grader, matrix, fingerprint,
  feedback (the current `eval-*` block, 8 services).
- **Execution is provider-specific** — the skill runs in a provider's agent
  runtime via the shared runner.
- **v1: mono-provider (Claude).**
- **Later: portability eval** — run the same skill through several provider
  runtimes (Claude Code, Cursor, Codex…) and compare, validating that a skill
  truly works "across any skills-compatible agent." Enabled for free by the open
  standard; out of v1 scope.

## Distribution (no proprietary marketplace)

A skill is just a folder, so sharing is **git / copy** — no registry, no central
service, local-first preserved. A team's skill library can be a git repo; an
organisation can share via its own repos. "Publish to a marketplace" is **not** a
Techne feature; the earlier framing was a misunderstanding. If discovery/sharing
UX is wanted later, it builds on plain folders + git, not a proprietary backend.

## Inter-module: recommendation consumer

Techne `consumes` `recommendation.consumer:skill`. When Argos is installed, cards
whose `artifactType` is `skill` get an "Apply" action routed to Techne, which
spawns the matching `create`/`fix` run on the shared runner. See
[05-inter-module-contracts.md](../05-inter-module-contracts.md).

## Screens (front)

`SkillsScreen`, `SkillDetailScreen`, `BundledSkillConflictsView`,
`components/skill/`. The former `MarketplaceScreen` is dropped/repurposed — there
is no marketplace; the equivalent surface is the **decoupled library browser**.
All on the `@nakirosai/ui` `LifecycleScreen` scaffold.

## v1 scope

- **Live:** Claude. Decoupled library under `~/.nakiros/`, authoring + audit +
  eval + improve, install via symlink into `.claude/skills` (project) and
  `~/.claude/skills` (global), plus plugin bundles.
- **Placement model ready** for other providers (resolver abstraction in place),
  but only the Claude resolver is implemented.

## Deliberately later (not v1)

- Portability eval across providers.
- `.agents/skills` and Cursor/Codex placement resolvers.
- Any sharing/discovery UX (git-based, never a proprietary registry).

## Open questions for implementation

- Exact `~/.nakiros/` library layout and how it relates to versioning/drafts.
- Plugin-bundle authoring: a plugin bundles skills (+ commands/agents) — how the
  decoupled library composes a plugin for install.
- Verify each provider's skills directory when adding its placement resolver.
