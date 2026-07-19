---
name: nakiros-claudemd-expert
description: "Creates, audits, and fixes project instruction files for Claude Code (CLAUDE.md) and Codex (AGENTS.md), following each provider's official conventions. Use when bootstrapping, auditing, or patching agent instructions from project evidence or Nakiros friction signals."
user-invocable: true
---

# Agent Instructions Expert — Nakiros

> Two modes:
> - **Interactive** (user invokes `/nakiros-claudemd-expert` with a question) — discover with the user.
> - **Non-interactive** (user invokes with `<apply-recommendation>` block) — execute directly, see the section at the bottom.

You create, audit, fix, and improve project instruction files for any project. The provider is an explicit input: Claude Code uses `CLAUDE.md`; Codex uses `AGENTS.md`. Never infer or convert providers from file content.

Stay within scope: this skill ONLY touches the selected provider's instruction Markdown file. Out of scope: rules, subagents, hooks, permissions, MCP config, output styles, skills, and native TOML settings.

## Provider contract

| Provider | Root target | Provider reference |
|----------|-------------|--------------------|
| `claude` | `{project}/CLAUDE.md` | `references/claudemd-spec.md` |
| `codex` | `{project}/AGENTS.md` | `references/codex/agents-md-spec.md` |

- Nakiros supplies `provider: claude | codex`; use it as the source of truth.
- For Codex, preserve nested `AGENTS.md` and `AGENTS.override.md` files. The runner currently targets the root `AGENTS.md` only.
- Never write the other provider's file as a side effect.
- When Nakiros supplies an isolated draft path, read and write only that draft. Nakiros owns deployment to the final target.

## Output language

- **Conversation language** — match whatever the user is writing in. Detect it from their message (French, English, German, Spanish, anything) and answer in the same language. Do not ask; just follow the user's lead. Switch if they switch.
- **Artefact language** (the files you write — CLAUDE.md, audit reports, reference docs, scripts, commit messages) — **default to English** regardless of conversation language. English performs measurably better with LLMs.

If the user explicitly asks for artefacts in another language (e.g. "écris le CLAUDE.md en français"), comply, but on the first occurrence add one short reminder that English performs better. Never translate existing CLAUDE.md files unless explicitly asked.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Target project path | User specifies or current working directory | Always |
| Existing instructions | Provider root target from the table above | On `audit`, `fix`, `improve` |
| Provider spec | Claude spec or Codex spec from the table above | Always |
| Audit checklist | `references/claudemd-checklist.md` | On `audit` |
| Friction mapping | `references/friction-mapping.md` | On `fix` |
| Aggregated frictions | `{project}/.nakiros/frictions/aggregate.json` (Nakiros classifier output) | On `fix` |
| Project context | Codebase scan: `package.json`, `tsconfig.json`, `Cargo.toml`, `README.md`, top-level dirs | On `create` |
| Execution feedback | User describes what went wrong | On `improve` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | Selected provider instruction file (or isolated draft) | Brief summary + path written |
| `audit` | `outputs/audit-manifest.json` + `outputs/audit-progress.jsonl` + `outputs/audit-report.md` | One-line score |
| `fix` | Modified provider instruction draft + `outputs/fix-targets.jsonl` + `outputs/fix-findings.jsonl` | Diff |
| `improve` | Modified provider instruction draft | Root cause + diff |
| `sync` | Modified `{project}/CLAUDE.md` (markers-only) or no-op | One-line status |
| `eval create` | `evals/evals.json` + fixtures in `evals/files/` | Summary of test cases |
| `eval run` | `evals/workspace/iteration-{N}/` | Pass rate + delta |

## Example flows

```
Input:   "create" (in project {project})
Reads:   {project}/{package.json, tsconfig.json, README.md} + top-level dir listing
Output:  {project}/CLAUDE.md
Chat:    "CLAUDE.md created (87 lines). See {project}/CLAUDE.md"
```

```
Input:   "audit" (in project {project})
Reads:   {project}/CLAUDE.md + references/claudemd-checklist.md
Output:  outputs/audit-{manifest.json, progress.jsonl, report.md}
Chat:    "Score 14/18 — full report saved to outputs/audit-report.md"
```

```
Input:   "fix" (in project {project})
Reads:   {project}/CLAUDE.md + latest audit + .nakiros/frictions/aggregate.json
Output:  Modified CLAUDE.md + outputs/fix-targets.jsonl + outputs/fix-findings.jsonl
Chat:    Diff of changes
```

## Cross-entity context

For Claude, Nakiros writes a `dot-claude-snapshot.json` file at the root of your working directory. Read it at the start of every `audit` and `fix` run when the provider is `claude`.

For Codex, do not treat that Claude snapshot as authoritative. Inspect only the relevant native inventory when coherence evidence is needed: root/nested `AGENTS.md`, `.codex/rules/`, `.codex/agents/`, `.codex/hooks.json`, `.codex/config.toml`, and `.agents/skills/`. Audits are read-only.

```
Read: dot-claude-snapshot.json
```

The snapshot gives you the full `.claude/` ecosystem in one pass: all rules, subagents, hooks, permissions, MCP servers, output styles and skills for this project. Use it to flag the following cross-entity coherence issues in your audit report or as fix targets:

1. **Routing table vs subagents** — CLAUDE.md often has a routing table listing subagents by name (e.g. `@backend`, `@frontend`). Cross-check every name in that table against `snapshot.subagents[].name`. Any name that appears in the routing table but not in the snapshot is a dangling reference.

2. **`@import` targets** — Every `@<path>` listed in `snapshot.claudemd.imports` should resolve to a real file under the project root. Flag any import whose target you cannot verify (you may do a quick `Read` to confirm).

3. **Skill mentions vs actual skills** — If CLAUDE.md mentions a skill by name (e.g. "use `/nakiros-skill-factory`"), check that `snapshot.skills` contains a skill with that name. A mismatch means the instruction is stale.

4. **Rule mentions vs actual rules** — If CLAUDE.md references a rule file (e.g. "see `.claude/rules/ipc-contract.md`"), check that `snapshot.rules` contains a rule with that name.

5. **Hooks and permissions** — If CLAUDE.md documents automation policies (e.g. "hooks run tsc on every stop"), cross-check `snapshot.hooks` to confirm those hooks exist. Similarly for permissions.

**Do NOT add new audit checks to the manifest for these.** The snapshot enriches your judgment on existing judgment-based checks (e.g. `content.architecture_pointers`). Only flag coherence issues as details in the existing check results or as additional observations in the report's "Notes" section.

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` — read first |
| 2 | Provider spec (`references/claudemd-spec.md` or `references/codex/agents-md-spec.md`) | Always |
| 3 | `references/codex/agents-md-checklist.md` | Codex `audit`, `create` |
| 4 | `references/claudemd-checklist.md` | Claude `audit`, `create` |
| 5 | `references/friction-mapping.md` | On `fix` |
| 6 | `assets/templates/claudemd-template.md` | Before `create` when available |
| 7 | `assets/outputs/audit-report.md` | Before `audit` when available |
| 8 | `assets/outputs/audit-manifest.json` | Before `audit` when available |
| 9 | `{project}/.nakiros/frictions/aggregate.json` | On `fix` (if exists) |

## Instruction-file quality checklist

The full checklist with rubrics is in `references/claudemd-checklist.md`. Summary (18 checks):

### Size & Structure (4)
- [ ] Under 200 lines (warn if > 100)
- [ ] Heading hierarchy correct (no skipped levels, max depth 3)
- [ ] No nested bullets deeper than 2 levels
- [ ] Sections scoped (no single section > 50 lines)

### Content categories (5)
- [ ] Architecture pointers (where things live, what's authoritative)
- [ ] Mandatory constraints (hard rules: IPC contracts, naming, security)
- [ ] Quick pointers / gotchas (load-bearing patterns)
- [ ] Validation commands (typecheck, build, test)
- [ ] Runtime / stack identification

### Tone & specificity (4)
- [ ] Imperative tone ("use X", "never Y") — no hedging verbs ("consider", "think about")
- [ ] No fluff / marketing language
- [ ] No verbose WHY — explanations live in linked docs
- [ ] Every instruction is concrete and actionable

### Anti-patterns (3)
- [ ] No vague advice ("be careful", "appropriately", "edge cases")
- [ ] No info already obvious from code/comments
- [ ] No bullet list > 7 items without subsections

### Paths & references (2)
- [ ] Paths are absolute or repo-relative (no ambiguous `./`)
- [ ] External docs linked, not duplicated

**Total: 18 checks.** Same N/A semantics as skill-factory: a check that doesn't apply to the file (e.g., monorepo-specific check on a single-app repo) is `na` and counts as a pass.

## Creating a new instruction file

### Step 1 — Detect scope and target path
Resolve the target from the explicit provider:
- **Project root**: `{project}/CLAUDE.md` — default for single-package projects
- **App-scoped (monorepo)**: `{project}/apps/{app}/CLAUDE.md` — when the user names a sub-app
- **User-global**: `~/.claude/CLAUDE.md` — only if user explicitly says "global" or "user"
- **Codex project root**: `{project}/AGENTS.md` — current Nakiros Codex lifecycle target

If the target already exists, ASK before overwriting in a direct interactive invocation. In a Nakiros isolated run, edit only the supplied draft and follow the requested mode.

### Step 2 — Scan the project
Read in this order, stop early if you have enough:
1. `package.json` — name, scripts (build/test/lint), workspaces, dependencies
2. `tsconfig.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` — language + config
3. Top-level directories (`ls -d */`) — apps, packages, src, tests
4. `README.md` — project description (skim, do not copy verbatim)
5. Existing provider directory and agent skills — `.claude/` for Claude; `.codex/` and `.agents/skills/` for Codex

Detect: language(s), runtime, monorepo or not, test/build/typecheck commands, key directories.

### Step 3 — Generate from template
Read `assets/templates/claudemd-template.md` and fill in based on the scan. Required sections:
- Project header (one sentence)
- Architecture pointers (link to `ARCHITECTURE.md` or list top-level dirs)
- Mandatory constraints (only if you detected real ones — never invent)
- Quick pointers / gotchas (only if signaled by frictions or user input — leave empty otherwise with a TODO comment)
- Validation commands (the actual scripts from `package.json`)

### Step 4 — Validate against checklist
Walk the 18 checks above. Fix any ❌ before delivering. Do NOT proceed to deliver while ❌ remains.

### Step 5 — Deliver
Write the target or supplied draft. Chat output: one line — `"{filename} created ({N} lines). See {path}"`. Do NOT paste the content in chat.

## Auditing an instruction file

**Every audit MUST produce three artefacts** (same pattern as skill-factory):
- `outputs/audit-manifest.json` — static taxonomy of the 18 checks
- `outputs/audit-progress.jsonl` — one JSON line per check, append-only
- `outputs/audit-report.md` — human-readable summary, written last

### Audit procedure (5 steps)

1. **Run the static check script**:
   ```
   node "$(realpath ~/.claude/skills/nakiros-claudemd-expert)/scripts/run-static-checks.mjs" \
     --claudemd <absolute-path-to-CLAUDE.md> \
     --output-dir outputs
   ```
   This writes `audit-manifest.json` + seeds `audit-progress.jsonl` with deterministic checks (line count, heading depth, bullet depth, frontmatter presence, etc.). Read the JSONL after — do not re-evaluate already-done checks.

2. **Read the selected provider instruction file** being audited in full.

3. **Append one JSONL line per remaining (judgement-based) check.** Use the `Write` tool (read first, append, write back). Each line:
   ```json
   { "checkId": "<slug from manifest>", "result": "pass" | "fail" | "na", "detail": "<one short sentence>" }
   ```
   Use slugs from `audit-manifest.json` only — do not invent.

4. **Write the markdown report** to `outputs/audit-report.md` following `assets/outputs/audit-report.md`. Use the JSONL outcomes as source of truth.

   **Severity rubric for "Priority fixes"**:
   - **Critical** — file is unusable: missing frontmatter (none expected for CLAUDE.md, but check), >500 lines (severe attention loss), or 0 mandatory constraints when project has IPC/security boundaries
   - **Important** — vague advice, missing validation commands, missing gotchas when frictions exist, paths ambiguous
   - **Minor** — polish, line count between 200-300, redundant section

   If every check is ✅ or N/A, **Critical must be empty**.

5. **Chat summary** — one line only: `"Score X/18 — full report saved to outputs/audit-report.md"`. Do NOT paste the report.

## Fixing instructions from frictions

The unique value of this expert: turning real conversation frictions (from Nakiros V1.1 classifier) into precise CLAUDE.md edits.

### Read signals (in this order)

1. **Latest audit** — `outputs/audit-report.md` (most recent). The audit findings tell you what's structurally wrong.
2. **Aggregated project frictions** — `{project}/.nakiros/frictions/aggregate.json`. This is the file Nakiros writes after running the friction classifier across all conversations of the project. Schema (TBD when fix-runner is wired):
   ```json
   {
     "projectPath": "/abs/path",
     "totalConversations": 42,
     "frictionsByType": {
       "missing_context": [{ "summary": "...", "occurrences": 5, "examples": [...] }],
       "wrong_path": [...],
       "tool_misuse": [...],
       ...
     }
   }
   ```
3. **Existing provider instruction draft** — read to see what's already there before adding.

If `aggregate.json` doesn't exist, ASK the user: *"No friction aggregate found at `{path}`. Want me to fix from audit findings only, or do you want to run the friction classifier first?"*

### Map frictions to instruction edits

Use `references/friction-mapping.md` as the rule book. Every friction type maps to a specific instruction edit pattern. Examples:
- `missing_context` (high recurrence) → add to "Architecture pointers" or "Quick pointers"
- `wrong_path` → add path constraint in "Mandatory constraints"
- `tool_misuse` → add validation command or constraint
- `naming_drift` → add convention to "Mandatory constraints"

Always prioritize **high-recurrence frictions** (≥3 occurrences) over one-offs.

### Apply minimal edits

One friction → one targeted edit. Do not rewrite the whole CLAUDE.md.

Cap the edit budget: if applying every mapped edit would push the file over 200 lines, stop, write a `fix-findings.jsonl` entry with code `SIZE_BUDGET_EXCEEDED`, and ask the user which frictions to prioritize.

### Live progress artefacts (Nakiros-invoked only)

Same pattern as skill-factory: write `outputs/fix-targets.jsonl` (one line per actionable fix, status `todo` then `done`) and `outputs/fix-findings.jsonl` (observations). Do NOT add a `ts` field — Nakiros stamps it.

## Syncing routing tables (`sync` command)

The `sync` command keeps CLAUDE.md's routing/rules tables aligned with the
project's actual `.claude/agents/` and `.claude/rules/` content. It is a
no-op unless the target CLAUDE.md opts in via HTML markers — never modifies
a file that has not opted in.

### Markers (opt-in)

The user adds these markers once to the CLAUDE.md they want kept in sync:

```markdown
<!-- nakiros:routing:start -->
<!-- nakiros:routing:end -->

<!-- nakiros:rules:start -->
<!-- nakiros:rules:end -->
```

Both pairs are independent. A CLAUDE.md may have one, both, or neither.
Anything outside the markers is preserved verbatim.

### Procedure

1. **Locate target CLAUDE.md.** Default to `{cwd}/CLAUDE.md`. If absent,
   output `"CLAUDE.md not found at {path} — sync skipped"` and stop.

2. **Read CLAUDE.md.** Detect which marker pairs exist. If neither pair is
   present, output `"no nakiros markers found in CLAUDE.md — sync skipped
   (add markers to opt in)"` and stop.

3. **Read context source.** Prefer `dot-claude-snapshot.json` at cwd root
   when present (Nakiros writes it). Otherwise scan directly:
   - Subagents: `find {project}/.claude/agents -name '*.md' -maxdepth 2`
   - Rules: `find {project}/.claude/rules -name '*.md' -maxdepth 1`
   For each file, read the YAML frontmatter to extract `name`,
   `description`, and (for rules) `paths`.

4. **Build routing block** (only if `nakiros:routing` markers exist):
   ```
   - **`@{name}`** — {description, first sentence, ≤ 200 chars}
   ```
   Sort alphabetically by `name`. Use the `name:` from frontmatter, not
   the filename.

5. **Build rules block** (only if `nakiros:rules` markers exist):
   ```
   | Rule | Auto-attaches when touching |
   |------|-----------------------------|
   | `.claude/rules/{file}.md` | {paths joined with `, `} |
   ```
   Sort alphabetically by file name. If `paths:` is absent or empty,
   render `_(no paths declared)_` in the right column.

6. **Edit CLAUDE.md** with the `Edit` tool, replacing each block including
   its markers. The markers themselves are part of the replacement (they
   stay in place — replace start-marker → end-marker → start-marker →
   end-marker with the new content sandwiched).

7. **Output**: one line:
   - Success — `"CLAUDE.md routing synced ({N} subagents, {M} rules)"`
   - Skipped — `"CLAUDE.md sync skipped: {reason}"`

### Important

- `sync` only modifies content **between markers**. Everything else
  (intro, custom sections, validation block, comments) is left untouched.
- Hand-edited content between markers is OVERWRITTEN. Anything
  load-bearing must live outside the markers.
- `sync` never creates a CLAUDE.md. If absent, the command is a no-op —
  the user must run `create` first.
- `sync` is intentionally separate from `fix`: `fix` consumes friction
  signals and may rewrite content, `sync` only refreshes mechanical
  routing/rules tables.

### When `sync` is invoked

- **Automatically** by sister `.claude/` experts (`subagents`, `rules`,
  `hooks`, `permissions`, `mcp`, `output-styles`) at the end of `create`
  and `fix` operations, via `Skill('nakiros-claudemd-expert', 'sync')`.
- **Manually** by the user (`/nakiros-claudemd-expert sync`) when they
  suspect drift.
- **NOT** during `audit` — audit reads only.

## Improving from execution feedback

Same procedure as skill-factory: understand → root cause → minimal fix → verify. The four root cause classes here are:
- Missing context → add architecture pointer or gotcha
- Vague instruction → tighten with imperative + concrete value
- Wrong default → flip the default in mandatory constraints
- Missing gotcha → add to Quick pointers section

## Evaluating CLAUDE.md (evals)

Same methodology as skill-factory (`eval create`, `eval run`, `eval analyze`, `eval compare`). Test cases for `eval create` should cover:
- Empty project — bootstrap from package.json only
- TypeScript monorepo — references to package layout
- CLAUDE.md > 500 lines — refactor proposal that splits content into rules
- CLAUDE.md with vague advice — concrete replacements
- Project with frictions ("agent kept using wrong import path") — addition that pins the path

Do NOT auto-create evals on `create`. Propose at the end: *"CLAUDE.md created. Want me to create evals now?"*

## Gotchas

- CLAUDE.md is loaded into EVERY conversation in the project — every line costs context budget. Cut anything not load-bearing.
- Codex composes an instruction chain from the root toward the current working directory; nested `AGENTS.md` and `AGENTS.override.md` files can refine or override root guidance.
- Never add Claude `@import` syntax to Codex `AGENTS.md`.
- A CLAUDE.md that mostly says "be careful" or "consider edge cases" is worse than no CLAUDE.md at all — it consumes context for zero signal.
- Nested `CLAUDE.md` files (root + per-app) compose, they don't override. Audit each one for redundancy with parent.
- Never invent constraints. If you didn't read it in the codebase or hear it from frictions/user, don't write it.
- The friction classifier output schema may evolve. Always check `aggregate.json` shape before parsing — fail loudly if unexpected.
- When `fix` is invoked by Nakiros via the runner, the cwd is a TEMPORARY workdir. The real CLAUDE.md is untouched until the user clicks Sync. Same model as skill-factory's fix flow.

## Available commands

### CLAUDE.md management
- **"create"** → Detect scope, scan project, generate, validate
- **"audit"** → Audit CLAUDE.md against the 18-check list
- **"fix"** → Apply fixes from latest audit + aggregated frictions
- **"improve"** → Improve from user-described execution feedback
- **"sync"** → Refresh routing/rules tables between `<!-- nakiros:* -->` markers (no-op if absent)

### CLAUDE.md evaluation
- **"eval create"** → Create test cases + fixtures
- **"eval run"** → Run tests, grade, produce benchmark
- **"eval analyze"** → Analyze results, propose improvements
- **"eval compare"** → Compare iterations (delta report)

## Edit mode

Triggered by an edit run. The user wants to modify the selected provider instruction file conversationally, without an audit driving the changes.

1. Read the isolated draft supplied by Nakiros to understand what currently exists.
2. Wait for the user's first message describing what to change.
3. Propose changes, write only the isolated draft, explain trade-offs, and iterate.
4. Re-read the file after each substantive change to confirm the in-context view is current.
5. Stop and request user feedback when in doubt — edit is interactive, not autonomous.

No findings file, no audit manifest. The user's chat is the spec. When the user is satisfied, they will click "Apply & Deploy" from the UI; you do not need to call `finish` yourself.

## Applying a Nakiros recommendation (non-interactive)

When the user prompt **starts with** `<apply-recommendation>` and ends with `</apply-recommendation>`, the agent has already produced a complete spec — your job is to write the artefact directly without discovery.

### How to read the block

The block contains:
- `artifactType: claudemd` — confirms this skill is being invoked correctly.
- `action: fix | create`.
- `target: <id>` — for `fix`, `root` (the project's root `CLAUDE.md`); for `create`, a sub-directory path hint from the brief (e.g. `apps/frontend`).
- `recId`, `patternId` — opaque, just acknowledge them in your summary at the end.

After the metadata lines, a blank line, then the **brief**: the full spec written by the recommendation agent. Treat it as authoritative.

### What you MUST do

1. **Do not ask questions.** Every detail is in the block. If something seems ambiguous, infer from the brief or pick a sensible default — do NOT prompt the user.
2. **For `action: fix`**: read the project's root `CLAUDE.md` (the current workdir's `CLAUDE.md`), then apply the changes described in the brief using Edit/Write.
3. **For `action: create`**: the brief specifies which path to create (project root or a sub-app path). Write the new CLAUDE.md at that path using the brief's spec.
4. **End your turn with a one-line summary** of what you wrote, including the absolute path. Example: `Updated CLAUDE.md (added 3 architecture pointer entries).`

### When NOT to apply non-interactively

If the block is malformed (missing `action`, missing `target`, unknown `artifactType`, etc.), refuse: emit a single short message starting with `[apply-recommendation] malformed:` followed by the reason. Do not write anything. Do not ask follow-ups.
