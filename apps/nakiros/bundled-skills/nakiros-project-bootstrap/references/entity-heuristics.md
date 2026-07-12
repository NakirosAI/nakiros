# Cross-entity arbitration heuristics

These heuristics decide, per entity type, whether a from-scratch project has
enough grounded evidence to justify a proposal — and if so, what belongs
where. They are the core value of this skill: without them, an agent tends
to over-propose (a bit of everything, "just in case") which defeats the
purpose of a curated bootstrap plan.

General rule before anything else: **every proposal's `rationale` must cite
something real** — a file path, a `package.json` script name, a
`dot-claude-snapshot.json` fact, or a friction excerpt. If you can't point at
evidence, don't propose. An empty slice for an entity type is a correct,
common outcome — not a gap to fill.

## CLAUDE.md vs rules

CLAUDE.md is loaded into **every** conversation regardless of which files
are touched — it is the most expensive context to spend. Rules are
path-scoped: they auto-attach only when a matching file is edited (via
frontmatter `paths:`).

**Decision test:** can you name a glob that captures every time this
guidance matters? If yes → propose a rule with that `paths:` glob, not a
CLAUDE.md bullet. If the guidance is genuinely needed in *every* conversation
regardless of what's touched (stack identification, monorepo layout,
top-level routing to subagents, validation commands, hard global
constraints like "never commit secrets") → CLAUDE.md.

**Size discipline:** target under ~100-150 lines for a freshly bootstrapped
CLAUDE.md (the `nakiros-claudemd-expert` checklist warns above 100, hard
caps around 200-500). If your draft grows past that, move path-scoped
sections out into rules instead of trimming content you believe is load
bearing.

**What earns a CLAUDE.md line:** a fact you found in the codebase scan
(stack, monorepo layout, real validation commands) or a routing table to
subagents you are also proposing. Never invented boilerplate ("write clean
code", "follow best practices") — see `nakiros-claudemd-expert`'s own
gotcha: vague advice is worse than no CLAUDE.md.

## Subagents

**Decision test:** is this a monorepo with 2+ sub-trees that are (a)
independently ownable (different stack, different team boundary, or
different top-level app/package) and (b) large enough that loading one
sub-tree's context for work on another would be wasteful?

- Single-package repo, or a monorepo where every app shares one obvious
  concern → **do not** propose subagents. A routing table with one entry
  ("@app") adds indirection for no benefit.
- Two or more clearly separable apps/packages (e.g. `apps/api` +
  `apps/web`, or `apps/nakiros` + `apps/frontend` as in this very repo) →
  propose one subagent per sub-tree, scoped to its real top-level directory.
  Base the scope description on directories/files you actually saw during
  the codebase scan, not a guess at what such an app "usually" contains.
- Name subagents after the directory they own (e.g. `api.md`, `web.md`,
  `backend.md`) so a CLAUDE.md routing table referencing `@api`/`@web`
  matches the filenames 1:1 (`nakiros-claudemd-expert`'s coherence check
  cross-references exactly this).

## Permissions

**Decision test:** what commands does this project's tooling *actually run*?
Read `package.json` scripts, any `.github/workflows/*.yml`, and the detected
package manager. Propose `allow` entries only for those concrete commands
(e.g. `Bash(pnpm test:*)`, `Bash(pnpm run build:*)`) — never a generic
"allow common dev commands" list invented from nothing.

- **Never** propose loosening the default permission mode
  (`bypassPermissions`, `dontAsk`) — that is a security regression Nakiros
  will not recommend by default.
- `deny` entries only for patterns that are already conventional cautionary
  practice evidenced by the codebase (e.g. a `.gitignore`d `.env` file
  implies denying reads of `.env*`) — do not draft a generic security policy
  the project gave you no signal for.
- If the codebase gives no clear signal beyond "there are scripts," a
  minimal `allow` list for the handful of scripts you found is still a
  legitimate, valuable proposal (it directly reduces permission-prompt
  friction — the single most common friction pattern Nakiros observes).

## Hooks

Hooks execute arbitrary shell commands on Claude Code lifecycle events —
**highest blast-radius entity in the taxonomy.** Propose one only when a
hook would run a script that is **already proven** in the repo (e.g. a
`typecheck` or `lint` script already exists and passing it after every stop
is an obvious, low-risk automation).

- If you cannot point at an existing script the hook would invoke unchanged,
  do not propose the hook.
- Prefer `Stop` (end-of-turn validation) over `PreToolUse`/`PostToolUse`
  hooks for a first bootstrap — the latter are more invasive and easier to
  get wrong (matcher scoping, exit-code semantics).
- Default expectation for a fresh bootstrap: **zero or one** hook proposal.
  Multiple hooks on a first pass is a signal you're inventing automation
  rather than reflecting what's there.

## MCP servers

**Decision test:** does the codebase show unambiguous evidence of an
external system that would benefit from durable tool access (a documented
internal API client, a specific database the code already talks to with its
own protocol, an internal knowledge base referenced in the README)?

In practice, a fresh bootstrap on an empty `.claude/` **rarely** clears this
bar — most projects have no MCP-worthy external dependency visible from the
codebase alone. Default to proposing **nothing** for `mcp` unless the
evidence is concrete and specific (not "this project uses a database" —
databases don't need MCP; "this project's README documents an internal
GraphQL gateway agents should query" would).

## Output styles

**Decision test:** is there explicit evidence of a desired communication
style — the project's own docs instructing a tone, or a friction digest
explicitly about style mismatch (too verbose, wrong language, too casual)?

Codebase structure alone almost never signals this. Default to proposing
nothing for `output-style` on a fresh bootstrap unless friction digests are
present and explicitly call it out (`usedFrictionDigests: true` in that
case).

## Skills

**Out of scope for v1.** Do not propose `skill` entities — creating a new
skill is `nakiros-skill-factory`'s job, invoked separately by the user when
they recognise a recurring multi-step workflow. Proposing one here would
duplicate that flow without the grounding a real recurring-task signal
provides.

## Cross-entity coherence checks (apply once every entity decision is made)

Before finalising the plan, re-read your own proposals as a set and check:

1. Every subagent name you propose that also appears in a CLAUDE.md routing
   table you're drafting must match exactly (same convention
   `nakiros-claudemd-expert` audits for).
2. Every rule you propose should be referenced (even briefly) from the
   CLAUDE.md routing table if you're also proposing a CLAUDE.md — same
   coherence expectation the sister experts already enforce post-hoc.
3. Permission `allow` entries should cover every command your own CLAUDE.md
   validation-commands section names — don't propose a CLAUDE.md that tells
   the agent to run a command your permissions proposal doesn't allow.
