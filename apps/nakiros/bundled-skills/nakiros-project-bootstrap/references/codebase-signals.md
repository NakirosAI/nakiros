# Codebase signals to gather before drafting a plan

Read in this order, stop early once you have enough to ground every
proposal you intend to make. This mirrors `nakiros-claudemd-expert`'s
`create` scan (step 2) — reuse the same signals rather than inventing a
parallel scan.

## 1. Package manifest(s)

- `package.json` at the root — `name`, `scripts` (build/test/lint/typecheck
  and any others), `workspaces` (monorepo detection), `dependencies` /
  `devDependencies` for stack identification (React? Express? tRPC?).
- If `workspaces` is present, also read each workspace's own `package.json`
  scripts — the root scripts are often thin wrappers (e.g. `turbo build`)
  and the real per-app commands live one level down.
- Non-Node stacks: `pyproject.toml` / `requirements.txt` (Python),
  `Cargo.toml` (Rust), `go.mod` (Go) — same purpose, adapt the signal.
- Lockfile present (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`) →
  identifies the package manager, which changes the exact permission
  command strings you'll propose (`pnpm test:*` vs `npm test`).

## 2. Monorepo layout

- Top-level directory listing (`apps/`, `packages/`, `services/`, or a flat
  single-package layout). This is the primary signal for the subagents
  decision test in `references/entity-heuristics.md`.
- For each top-level app/package: does it have its own `package.json`,
  its own obvious language/framework, its own test setup? That's what makes
  it "independently ownable" rather than just a subdirectory.

## 3. CI configuration

- `.github/workflows/*.yml` (or equivalent for other CI providers) — the
  most reliable signal for "commands actually run," often more precise than
  `package.json` scripts alone (CI frequently runs flags/subsets that
  `package.json` doesn't surface). Use this to ground permission `allow`
  entries and hook proposals.

## 4. README and top-level docs

- `README.md` — skim for stack description, setup instructions, and any
  explicit conventions the authors documented (never copy verbatim into
  CLAUDE.md — paraphrase, and only what's still true).
- Any `ARCHITECTURE.md`, `CONTRIBUTING.md`, or `docs/` entry point — if one
  exists, your CLAUDE.md proposal should point to it rather than duplicate
  it (same "external docs linked, not duplicated" rule
  `nakiros-claudemd-expert` audits for).

## 5. Existing `.claude/` (via the snapshot, not a manual scan)

Always prefer `dot-claude-snapshot.json` over scanning `.claude/` yourself —
Nakiros already parsed it consistently. You only need this to run the
"minimal vs non-minimal" check in SKILL.md; if minimal, there is nothing
else to read here.

## 6. Friction digests (optional enrichment)

- `friction-digests.json` at the root of your working directory — written
  by the bootstrap runner ONLY when conversation-ingest is enabled and the
  project has at least one digest with frictions (`{ projectPath,
  generatedAt, sessionCount, digests: ConversationDigest[] }`, newest first,
  capped at 20). Check for its existence before reading — most bootstrap
  runs won't have it, and that's the expected common case, not a failure.
- Each `ConversationDigest` entry carries `sessionSummary`, `phases`,
  `frictions` (with `whatHappened`, `ruleCandidate`, `scope`, `confidence`),
  and `extractedRules` — read defensively (treat missing fields as absent
  rather than failing the whole plan) since this is a shared daemon type
  that may gain fields over time.
- If present and a friction **recurs** across sessions (the same file area
  or the same `ruleCandidate` showing up more than once), it can justify a
  proposal the codebase alone would not have grounded — e.g. an
  `output-style` proposal, or a rule targeting the exact files the friction
  kept touching. Set `usedFrictionDigests: true` on the plan when you use
  one this way.

## What NOT to do

- Do not `grep`/read arbitrary source files hunting for "interesting"
  conventions beyond what's needed to ground a specific entity decision —
  this skill proposes structure, it does not perform a full code review.
- Do not treat the absence of CI or scripts as a reason to invent generic
  ones. No scripts found → no permission proposal grounded on scripts (you
  may still propose one grounded on CI, or none at all).
