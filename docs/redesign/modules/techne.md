# Module — Techne

> τέχνη, *craft*. Skill & plugin authoring.

## Scope

Create, audit, evaluate, and improve **Agent Skills** — decoupled from any
project. Skills follow the open [agentskills.io](https://agentskills.io)
standard, so the skill **content is identical across providers**; only the
install location is provider-specific.

The signature feature is **decoupled creation**: a skill is authored in its own
versioned library (under `~/.nakiros/`), independent of any codebase, then
installed where it is needed.

- **content** — one universal `SKILL.md` folder (agentskills.io)
- **placement** — symlinked into a provider's skills dir at the chosen scope:
  `<repo>/.claude/skills/` (project), `~/.claude/skills/` (global), plugin bundle
- **decoupled** — the library is the source of truth, not tied to a project

There is **no proprietary marketplace** — sharing is git/copy. See
[`techne-design.md`](techne-design.md) for the full model.

## Capabilities

- `consumes`: `recommendation.consumer:skill` — applies Argos cards whose
  `artifactType` is `skill`.
- `provides`: (none yet)

## Screens (front)

`SkillsScreen`, `SkillDetailScreen`, `BundledSkillConflictsView`,
`components/skill/`. The former `MarketplaceScreen` is repurposed as the
decoupled **library browser** (no marketplace). All built on the
`@nakirosai/ui` `LifecycleScreen` scaffold (audit → fix → eval).

## Backend services

`agent-cli`, `agent-installer`, `bundled-skills-{reader,sync}`,
`skill-{fingerprint,reader,symlink-override}`, `skill-fs/`,
`plugin-skills-reader`, `claude-global-skills-reader`, all `eval-*` (benchmark,
feedback, fingerprint, llm-grader, matrix, parser, runner, artifact-cleanup).

## Bundled skills

The skill factory itself (`nakiros-skill-factory`) and any authoring helpers,
run through the shared runner.

## IPC namespace

`techne:*` (handlers: agents, bundled-skills, eval, skill-agent, skill-dir,
skills-common, plugin-skills).

## Detailed design

See [`techne-design.md`](techne-design.md). Key resolved decisions:

- Skills = **one open standard** (agentskills.io); content identical across
  providers, only install location differs.
- Source of truth = a **decoupled library** under `~/.nakiros/`; install =
  **symlink** into the provider's skills dir (reusing `skill-symlink-override`).
- **No proprietary marketplace** — sharing is git/copy, local-first preserved.
- Eval methodology is universal; execution runs via the provider's runner.
- **v1 = Claude**; placement model ready for other providers; portability eval
  and `.agents/skills` / Cursor / Codex resolvers come later.
