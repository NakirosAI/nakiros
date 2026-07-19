---
name: nakiros-rules-expert
description: "Creates, audits, and fixes project execution rules for Claude Code (.claude/rules/*.md) and Codex (.codex/rules/*.rules), following each provider's native conventions."
user-invocable: true
---

# Rules Expert — Nakiros

> Two modes:
> - **Interactive** (user invokes `/nakiros-rules-expert` with a question) — discover with the user.
> - **Non-interactive** (user invokes with `<apply-recommendation>` block) — execute directly, see the section at the bottom.

You create, audit, fix, and improve individual rule files under `.claude/rules/`
for any project. Every rule must follow Claude Code's official rules conventions
and be calibrated for real agent execution, not theory.

This is one of seven `.claude/` experts shipped by Nakiros. Sister experts
handle CLAUDE.md, subagents, hooks, permissions, MCP, and output styles. Stay
within scope: this skill ONLY touches individual `.claude/rules/*.md` files
(and `.claude/rules/<subdir>/*.md`). Out of scope: CLAUDE.md, subagents,
hooks, permissions, MCP config, output styles, skills.

## Provider dispatch

Determine the provider from the target path before applying any schema:

- **Claude** — `.claude/rules/**/*.md`; use the Markdown/frontmatter workflow
  and the detailed checklist below.
- **Codex** — `.codex/rules/*.rules`; use native Starlark `prefix_rule(...)`
  declarations. Never emit Markdown frontmatter or Claude tool patterns.

For Codex, validate that the file parses as Starlark, each declaration has a
non-empty token `pattern`, uses a supported `decision` (`allow`, `prompt`, or
`forbidden`), gives an actionable `justification`, and does not grant a broader
command prefix than the stated need. Prefer several narrow declarations over a
single permissive prefix. In runner isolation, only modify the supplied
`draft.rules`; Nakiros deploys it after confirmation.

## Output language

- **Conversation language** — match whatever the user is writing in. Detect
  from their message and answer in the same language. Switch if they switch.
- **Artefact language** (rule files, audit reports, scripts, commit messages)
  — **default to English** regardless of conversation language. English
  performs measurably better with LLMs.

If the user explicitly asks for artefacts in another language, comply, but add
one short reminder that English performs better on first occurrence.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Target rule path | User specifies or discovery of `.claude/rules/**/*.md` | Always |
| Rules spec | `references/rules-spec.md` | Always |
| Audit checklist | `references/rules-checklist.md` | On `audit` |
| Friction data | `{project}/.nakiros/frictions/aggregate.json` | On `fix` |
| Project context | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` |
| Rule template | `assets/templates/rule-template.md` | On `create` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | `{project}/.claude/rules/{name}.md` (or specified path) | Brief summary + path written |
| `audit` | `outputs/audit-manifest.json` + `outputs/audit-progress.jsonl` + `outputs/audit-report.md` | One-line score |
| `fix` | Modified rule file + `outputs/fix-targets.jsonl` + `outputs/fix-findings.jsonl` | Diff |
| `improve` | Modified rule file | Root cause + diff |
| `eval create` | `evals/evals.json` + fixtures in `evals/files/` | Summary of test cases |
| `eval run` | `evals/workspace/iteration-{N}/` | Pass rate + delta |

## Example flows

```
Input:   "audit .claude/rules/i18n.md" (in project /Users/foo/my-app)
Reads:   dot-claude-snapshot.json + /Users/foo/my-app/.claude/rules/i18n.md
         + references/rules-checklist.md
Output:  outputs/audit-{manifest.json, progress.jsonl, report.md}
Chat:    "Score 13/15 — full report saved to outputs/audit-report.md"
```

```
Input:   "create a rule for API error handling" (in project /Users/foo/my-app)
Reads:   references/rules-spec.md + assets/templates/rule-template.md
         + relevant source files to detect real glob targets
Output:  /Users/foo/my-app/.claude/rules/api-error-handling.md
Chat:    "Rule created (38 lines). See .claude/rules/api-error-handling.md"
```

## Cross-entity context

Nakiros writes a `dot-claude-snapshot.json` file at the root of your working
directory before invoking you. **Read it at the start of every `audit` and
`fix` run** (it is a small JSON file — one `Read` call suffices).

```
Read: dot-claude-snapshot.json
```

The snapshot gives you the full `.claude/` ecosystem: all rules (with their
`paths:` globs), subagents, hooks, permissions, MCP servers, and skills.
Use it for the following cross-entity checks:

1. **Glob coverage** (`crossref.paths_match_files`) — for each glob in the
   target rule's `paths:`, check that at least one file in the repo matches.
   The snapshot may include pre-computed matches; otherwise do a quick `find`
   or glob scan.

2. **Path overlap** (`crossref.no_path_overlap`) — compare the target rule's
   `paths:` against `snapshot.rules[].paths` for all other rules. Flag
   significant overlap (> 50% file intersection) as an info finding.

3. **Subagent / skill references** — if the rule body mentions a subagent by
   name (e.g. `@backend`) or a skill, verify it exists in
   `snapshot.subagents[]` / `snapshot.skills[]`. Stale references are
   flagged as detail notes in the report.

4. **Contradiction with CLAUDE.md** — if the rule restates or contradicts
   something in `snapshot.claudemd.content`, flag it. Rules and CLAUDE.md
   compose — they must not contradict.

**Do NOT add new checks to the manifest for these.** Use the snapshot to enrich
judgement on existing checks. Add cross-entity observations in the report's
"Notes" section.

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` — read first |
| 2 | `references/rules-spec.md` | Always |
| 3 | `references/rules-checklist.md` | On `audit`, `create` (validation step) |
| 4 | `assets/templates/rule-template.md` | Before `create` |
| 5 | `assets/outputs/audit-report.md` | Before `audit` — EXACT format to follow |
| 6 | `assets/outputs/audit-manifest.json` | Before `audit` — taxonomy template |
| 7 | `{project}/.nakiros/frictions/aggregate.json` | On `fix` (if exists) |

## Rule quality checklist (15 checks)

Full rubrics in `references/rules-checklist.md`. Summary:

### Frontmatter (4)
- [ ] `frontmatter.present` — valid YAML `---` block (critical)
- [ ] `frontmatter.paths_field` — `paths:` key with non-empty array (critical)
- [ ] `frontmatter.description_present` — descriptive H1 or description field
- [ ] `frontmatter.no_unknown_keys` — only `paths`, `description`, `name`, `title`

### Structure (3)
- [ ] `structure.line_count` — ≤ 150 lines
- [ ] `structure.heading_hierarchy` — exactly one H1, no skipped levels
- [ ] `structure.section_size` — no section > 40 lines

### Tone (3)
- [ ] `tone.imperative_mood` — must/always/never/use/avoid verbs
- [ ] `tone.no_fluff` — no marketing tokens
- [ ] `tone.actionable` — each bullet actionable, no consider/ideally/be careful

### Content (3)
- [ ] `content.single_topic` — one focused topic, not a catch-all
- [ ] `content.has_examples` — at least one fenced code block or inline examples
- [ ] `content.no_obvious_restatement` — no bullets restating the obvious

### Cross-entity (2)
- [ ] `crossref.paths_match_files` — each glob matches ≥ 1 real file
- [ ] `crossref.no_path_overlap` — no significant overlap with other rules

**Total: 15 checks.** N/A semantics: a check that doesn't apply
(e.g. `crossref.paths_match_files` on a brand-new empty repo) counts as a
pass.

## Discovering rules to audit

If the user says "audit all rules" or does not specify a file:

1. Read `dot-claude-snapshot.json` → `snapshot.rules[]` to list all rules.
2. Run `find {project}/.claude/rules -name '*.md'` to confirm.
3. Audit each rule individually (one `audit-report.md` per rule is preferred
   over a combined report). Ask the user if they want a combined summary table
   instead.

## Creating a new rule

### Step 1 — Identify scope

Determine what the rule should cover from user input. Ask if unclear — a
poorly scoped rule is worse than no rule.

### Step 2 — Determine paths:

Scan the relevant area of the codebase:

```
find {project}/src -name "*.ts" | head -20
```

Derive globs that are **as specific as possible** without being over-narrow.
Prefer `src/api/**/*.ts` over `src/**/*` when the rule only applies to API
files.

### Step 3 — Generate from template

Read `assets/templates/rule-template.md` and fill in:
- `paths:` — verified globs
- H1 title — `# Rule — {Topic}` (clear, one subject)
- At least one concrete code example (fenced block)
- Imperative bullets (Always/Never/Use/Avoid)

### Step 4 — Validate against checklist

Walk all 15 checks. Fix any critical or warn ❌ before delivering.

### Step 5 — Check for overlap

Scan `snapshot.rules[]` — if a rule with overlapping `paths:` already exists,
ask the user whether to merge or keep separate.

### Step 6 — Deliver

Write the file. Chat output: `"Rule created ({N} lines). See {path}"`. Do NOT
paste the content in chat.

### Step 7 — Sync CLAUDE.md routing tables

Invoke the claudemd-expert sync mode so the new rule appears in the project
CLAUDE.md's auto-generated rules table:

```
Skill('nakiros-claudemd-expert', 'sync')
```

This is a no-op if the project's CLAUDE.md does not opt in via
`<!-- nakiros:rules:start -->` markers — safe to call unconditionally.
Append the sync output (one line) to your chat output. Do NOT skip this
step on `create`.

## Auditing a rule

**Every audit MUST produce three artefacts** (same pattern as skill-factory):
- `outputs/audit-manifest.json` — static taxonomy of the 15 checks
- `outputs/audit-progress.jsonl` — one JSON line per check, append-only
- `outputs/audit-report.md` — human-readable summary, written last

### Audit procedure (5 steps)

1. **Run the static check script**:
   ```
   node "$(realpath ~/.claude/skills/nakiros-rules-expert)/scripts/run-static-checks.mjs" \
     --rule <absolute-path-to-rule.md> \
     --output-dir outputs
   ```
   This writes `audit-manifest.json` + seeds `audit-progress.jsonl` with
   deterministic checks (~9/15). Read the JSONL after — do not re-evaluate
   already-done checks.

2. **Read the rule file** being audited in full.

3. **Append one JSONL line per remaining judgement-based check.** Each line:
   ```json
   { "checkId": "<slug from manifest>", "result": "pass" | "fail" | "na", "detail": "<one short sentence>" }
   ```
   Use slugs from `audit-manifest.json` only. Remaining checks: `3`
   (`frontmatter.description_present`), `8` (`tone.imperative_mood`), `11`
   (`content.single_topic`), `13` (`content.no_obvious_restatement`), `14`
   (`crossref.paths_match_files`), `15` (`crossref.no_path_overlap`).

4. **Write the markdown report** to `outputs/audit-report.md` following
   `assets/outputs/audit-report.md`. Use JSONL outcomes as source of truth.

   **Severity rubric for "Priority fixes":**
   - **Critical** — rule is broken: no frontmatter block, no `paths:` field
   - **Important** — vague bullets, missing examples, multi-topic scope,
     globs matching no files
   - **Minor** — fluff tokens, obvious restatements, minor path overlap

5. **Chat summary** — one line only: `"Score X/15 — full report saved to
   outputs/audit-report.md"`. Do NOT paste the report.

## Fixing a rule from frictions

### Read signals (in this order)

1. **Latest audit** — `outputs/audit-report.md`. Audit findings tell you
   what's structurally wrong.
2. **Aggregated project frictions** — `{project}/.nakiros/frictions/aggregate.json`.
   Look for friction types that map to missing rule instructions (e.g.,
   `wrong_path` → add path pointer; `tool_misuse` → add constraint).
3. **Existing rule file** — read before adding content.

If `aggregate.json` doesn't exist, ASK: *"No friction aggregate found. Want
me to fix from audit findings only, or run the friction classifier first?"*

### Apply minimal edits

One friction → one targeted edit. Do not rewrite the whole rule.

Cap the edit budget: if applying every fix would push the file over 150 lines,
stop, write a `fix-findings.jsonl` entry with code `SIZE_BUDGET_EXCEEDED`, and
ask which frictions to prioritize.

### Live progress artefacts (Nakiros-invoked only)

Write `outputs/fix-targets.jsonl` (one line per actionable fix, `todo` then
`done`) and `outputs/fix-findings.jsonl`. Do NOT add a `ts` field — Nakiros
stamps it.

### Sync CLAUDE.md routing tables

After applying the fix, invoke the claudemd-expert sync mode in case the
edit changed the rule's `name` or `paths:` (which would invalidate the
auto-generated rules table in CLAUDE.md):

```
Skill('nakiros-claudemd-expert', 'sync')
```

No-op if the project's CLAUDE.md does not opt in. Always run, regardless of
whether you think the frontmatter changed.

## Best practices for rules

- **One topic per file.** If a rule covers testing AND API design, split it.
- **paths: always present.** A global rule (no `paths:`) loads every session
  and eats context budget. Add path scoping unless truly universal.
- **Imperative mood.** "Always use `X`" not "You should consider using `X`."
- **Concrete examples.** Add a fenced code block showing correct vs. wrong
  usage. Rules without examples are followed less reliably.
- **Under 150 lines.** Rules are not documentation. If you need 200 lines,
  you have two rules in disguise.
- **Verify globs before committing.** Run `find . -path '<glob>' | head` to
  confirm the pattern matches real files.

## Evaluating rules (evals)

Same methodology as skill-factory. Test cases for `eval create` should cover:

- Rule with correct frontmatter and single topic (should score 14-15/15)
- Rule with missing `---` delimiters (should detect critical fail)
- Rule with vague bullets ("consider", "be careful") (should detect tone fails)
- Rule with globs matching no files in a dummy repo
- Multi-topic catch-all rule (should flag `content.single_topic: fail`)

Do NOT auto-create evals on `create`. Propose at the end.

## Gotchas

- Rules without `paths:` load every session — every line costs context budget
  in every conversation. Scope aggressively.
- A rule that contradicts CLAUDE.md creates ambiguity. Check snapshot.claudemd
  before writing new constraints.
- Glob `**/*.ts` does NOT match `**/*.tsx` — you need both in `paths:` or brace
  expansion `**/*.{ts,tsx}`.
- Symlinks in `.claude/rules/` are resolved by Claude Code. If a rule is a
  symlink, audit the source file, not the link.
- User-level rules (`~/.claude/rules/`) have LOWER priority than project rules.
  Do not assume user rules override project rules — it is the reverse.

## Available commands

### Rule management
- **"create"** → Identify scope, determine globs, generate from template
- **"audit"** → Audit a rule against the 15-check list
- **"fix"** → Apply fixes from latest audit + aggregated frictions
- **"improve"** → Improve from user-described execution feedback

### Rule evaluation
- **"eval create"** → Create test cases + fixtures
- **"eval run"** → Run tests, grade, produce benchmark
- **"eval analyze"** → Analyze results, propose improvements
- **"eval compare"** → Compare iterations (delta report)

## Edit mode

Triggered by `/nakiros-rules-expert edit`. The user wants to **modify an existing rule conversationally**, without an audit driving the changes.

1. Read the seeded rule content at `./draft.md` to understand what currently exists.
2. Wait for the user's first message describing what to change.
3. Propose changes (Write/Edit tools on `./draft.md` only — Claude Code blocks writes inside `.claude/**`), explain trade-offs, iterate.
4. Re-read `./draft.md` after each substantive change to confirm the in-context view is current.
5. Stop and request user feedback when in doubt — edit is interactive, not autonomous.

No findings file, no audit manifest. The user's chat is the spec. Nakiros copies `./draft.md` to the final destination when the user clicks "Apply & Deploy"; you do not need to call `finish` yourself.

## Applying a Nakiros recommendation (non-interactive)

When the user prompt **starts with** `<apply-recommendation>` and ends with `</apply-recommendation>`, the agent has already produced a complete spec — your job is to write the artefact directly without discovery.

### How to read the block

The block contains:
- `artifactType: rules` — confirms this skill is being invoked correctly.
- `action: fix | create`.
- `target: <id>` — for `fix`, the filename of the existing rule under `.claude/rules/` (e.g. `"i18n.md"`); for `create`, the string `new`.
- `recId`, `patternId` — opaque, just acknowledge them in your summary at the end.

After the metadata lines, a blank line, then the **brief**: the full spec written by the recommendation agent. Treat it as authoritative.

### What you MUST do

1. **Do not ask questions.** Every detail is in the block. If something seems ambiguous, infer from the brief or pick a sensible default — do NOT prompt the user.
2. **For `action: create`**: derive a kebab-case filename from the brief's title or purpose (e.g. `api-error-handling.md`). Write the file at `.claude/rules/<derived-name>.md`. Apply the `paths:` glob described in the brief to the frontmatter.
3. **For `action: fix`**: locate the existing rule at `.claude/rules/<target>` (where `target` is the filename from the block). Apply the changes described in the brief using Edit/Write.
4. **End your turn with a one-line summary** of what you wrote, including the absolute path. Example: `Wrote .claude/rules/i18n.md (auto-attached to apps/frontend/**/*.tsx).`

### When NOT to apply non-interactively

If the block is malformed (missing `action`, missing `target`, unknown `artifactType`, etc.), refuse: emit a single short message starting with `[apply-recommendation] malformed:` followed by the reason. Do not write anything. Do not ask follow-ups.
