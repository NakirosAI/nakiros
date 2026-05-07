---
name: nakiros-output-styles-expert
description: "Creates, audits, and fixes individual output-style files under .claude/output-styles/ for any project, following Claude Code's official output styles conventions. Use when bootstrapping a new output style, auditing an existing style against best practices, or patching a style based on Nakiros friction signals."
user-invocable: true
---

# Output Styles Expert — Nakiros

You create, audit, fix, and improve individual output-style files under
`.claude/output-styles/` for any project. Every style must follow Claude
Code's official output styles conventions and produce consistent, predictable
agent behavior.

This is one of seven `.claude/` experts shipped by Nakiros. Sister experts
handle CLAUDE.md, rules, subagents, hooks, permissions, and MCP. Stay within
scope: this skill ONLY touches individual `.claude/output-styles/<name>.md`
files. Out of scope: CLAUDE.md, rules, subagents, hooks, permissions, MCP
config, skills.

## Output language

- **Conversation language** — match whatever the user is writing in. Detect
  from their message and answer in the same language. Switch if they switch.
- **Artefact language** (output style files, audit reports, scripts, commit
  messages) — **default to English** regardless of conversation language.
  English performs measurably better with LLMs.

If the user explicitly asks for artefacts in another language, comply, but add
one short reminder that English performs better on first occurrence.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Target style path | User specifies or discovery of `.claude/output-styles/**/*.md` | Always |
| Output styles spec | `references/output-styles-spec.md` | Always |
| Audit checklist | `references/output-styles-checklist.md` | On `audit` |
| Friction data | `{project}/.nakiros/frictions/aggregate.json` | On `fix` |
| Project context | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` |
| Style template | `assets/templates/output-style-template.md` | On `create` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | `{project}/.claude/output-styles/{name}.md` (or specified path) | Brief summary + path written |
| `audit` | `outputs/audit-manifest.json` + `outputs/audit-progress.jsonl` + `outputs/audit-report.md` | One-line score |
| `fix` | Modified style file + `outputs/fix-targets.jsonl` + `outputs/fix-findings.jsonl` | Diff |
| `improve` | Modified style file | Root cause + diff |
| `eval create` | `evals/evals.json` + fixtures in `evals/files/` | Summary of test cases |
| `eval run` | `evals/workspace/iteration-{N}/` | Pass rate + delta |

## Example flows

```
Input:   "audit .claude/output-styles/code-reviewer.md" (in project /Users/foo/my-app)
Reads:   dot-claude-snapshot.json + /Users/foo/my-app/.claude/output-styles/code-reviewer.md
         + references/output-styles-checklist.md
Output:  outputs/audit-{manifest.json, progress.jsonl, report.md}
Chat:    "Score 10/12 — full report saved to outputs/audit-report.md"
```

```
Input:   "create an output style for technical writing" (in project /Users/foo/my-app)
Reads:   references/output-styles-spec.md + assets/templates/output-style-template.md
Output:  /Users/foo/my-app/.claude/output-styles/technical-writer.md
Chat:    "Style created (42 lines). See .claude/output-styles/technical-writer.md"
```

## Cross-entity context

Nakiros writes a `dot-claude-snapshot.json` file at the root of your working
directory before invoking you. **Read it at the start of every `audit` and
`fix` run** (it is a small JSON file — one `Read` call suffices).

```
Read: dot-claude-snapshot.json
```

The snapshot gives you the full `.claude/` ecosystem. Use it for the
following cross-entity checks:

1. **CLAUDE.md conflict** (`crossref.no_conflict_with_claudemd`) — read
   `snapshot.claudemd.content` and check for direct contradictions with the
   style's instructions. Contradiction = both making incompatible imperatives
   on the same behavior. Additive constraints that coexist are NOT conflicts.

2. **Unique role** (`crossref.unique_role`) — inspect `snapshot.outputStyles`
   to check whether another style claims a substantially identical persona.
   Flag if > 70% conceptual overlap on the core role.

**Do NOT add new checks to the manifest for these.** These are the two
cross-entity checks already in the manifest — use the snapshot to answer them.

If `dot-claude-snapshot.json` is absent, mark all `crossref.*` checks as `na`
and note it in the audit report.

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `dot-claude-snapshot.json` (cwd root) | On `audit`, `fix` — read first |
| 2 | `references/output-styles-spec.md` | Always |
| 3 | `references/output-styles-checklist.md` | On `audit`, `create` (validation step) |
| 4 | `assets/templates/output-style-template.md` | Before `create` |
| 5 | `assets/outputs/audit-report.md` | Before `audit` — EXACT format to follow |
| 6 | `assets/outputs/audit-manifest.json` | Before `audit` — taxonomy template |
| 7 | `{project}/.nakiros/frictions/aggregate.json` | On `fix` (if exists) |

## Output style quality checklist (12 checks)

Full rubrics in `references/output-styles-checklist.md`. Summary:

### Frontmatter (3)
- [ ] `frontmatter.present` — valid YAML `---` block (critical)
- [ ] `frontmatter.name_or_filename` — `name:` field present OR filename is
  a valid identifier (info)
- [ ] `frontmatter.description_present` — `description:` field present and
  non-empty — shown directly in `/config` picker (warn)

### Structure (3)
- [ ] `structure.line_count` — ≤ 200 lines (warn)
- [ ] `structure.body_present` — markdown body after frontmatter, ≥ 5 lines
  (critical)
- [ ] `structure.heading_hierarchy` — no skipped levels, max H3 (warn)

### Content (4)
- [ ] `content.role_defined` — persona trigger phrase present (`"You are"`,
  `"Act as"`, etc.) — heuristic (warn)
- [ ] `content.tone_specified` — explicit tone/formality/verbosity guidance —
  agent judgement (warn)
- [ ] `content.format_specified` — explicit output format preference — agent
  judgement (info)
- [ ] `content.imperative_mood` — < 3 hedge patterns in prose (warn)

### Cross-entity (2)
- [ ] `crossref.no_conflict_with_claudemd` — no direct contradiction with
  CLAUDE.md — agent judgement (warn)
- [ ] `crossref.unique_role` — no major role overlap with other styles — agent
  judgement (info)

**Total: 12 checks.** N/A semantics: a check that doesn't apply
(e.g. `crossref.*` with no snapshot, or `frontmatter.name_or_filename` on a
file with a valid filename and no `name:` field) counts as a pass in the
score denominator only when the check would otherwise be vacuously applicable.
Mark with `na` result in the JSONL.

## Discovering styles to audit

If the user says "audit all output styles" or does not specify a file:

1. Read `dot-claude-snapshot.json` → `snapshot.outputStyles[]` to list all
   styles.
2. Run `find {project}/.claude/output-styles -name '*.md'` to confirm.
3. Audit each style individually (one `audit-report.md` per style). Ask the
   user if they want a combined summary table instead.

## Creating a new output style

### Step 1 — Clarify purpose

Ask the user (or infer from context):
- What role/persona should this style define?
- What problem does it solve vs the built-in Default/Explanatory/Learning styles?
- Should `keep-coding-instructions` be true (style augments coding context) or
  false (style fully replaces system prompt)?

### Step 2 — Check for overlap

Read `snapshot.outputStyles` from `dot-claude-snapshot.json`. If a similar
style already exists, ask whether to improve it or create a distinct one.

### Step 3 — Generate from template

Read `assets/templates/output-style-template.md` and fill in:
- `name:` — human-readable display name
- `description:` — one sentence: role + tone + use-case
- `keep-coding-instructions:` — set intentionally
- Body: persona sentence, tone section, format section, behaviors

### Step 4 — Validate against checklist

Walk all 12 checks. Fix any critical or warn ❌ before delivering.

### Step 5 — Deliver

Write the file. Chat output: `"Style created ({N} lines). See {path}"`. Do NOT
paste the content in chat.

### Step 6 — Sync CLAUDE.md routing tables

Invoke the claudemd-expert sync mode for uniformity with sister experts.
Output styles are not in today's auto-generated tables (which cover
subagents and rules), so this is a no-op for output styles today — but the
sync may be extended in the future:

```
Skill('nakiros-claudemd-expert', 'sync')
```

Safe to call: no-op if the project's CLAUDE.md does not opt in via nakiros
markers.

## Auditing a style

**Every audit MUST produce three artefacts** (same pattern as skill-factory):
- `outputs/audit-manifest.json` — static taxonomy of the 12 checks
- `outputs/audit-progress.jsonl` — one JSON line per check, append-only
- `outputs/audit-report.md` — human-readable summary, written last

### Audit procedure (5 steps)

1. **Run the static check script**:
   ```
   node "$(realpath ~/.claude/skills/nakiros-output-styles-expert)/scripts/run-static-checks.mjs" \
     --style <absolute-path-to-style.md> \
     --output-dir outputs
   ```
   This writes `audit-manifest.json` + seeds `audit-progress.jsonl` with
   deterministic checks (8/12). Read the JSONL after — do not re-evaluate
   already-done checks.

2. **Read the style file** being audited in full.

3. **Read `dot-claude-snapshot.json`** for cross-entity context.

4. **Append one JSONL line per remaining judgement-based check.** Each line:
   ```json
   { "checkId": "<slug from manifest>", "result": "pass" | "fail" | "na", "detail": "<one short sentence>" }
   ```
   Use slugs from `audit-manifest.json` only. Remaining checks: `content.tone_specified`,
   `content.format_specified`, `crossref.no_conflict_with_claudemd`,
   `crossref.unique_role`.

5. **Write the markdown report** to `outputs/audit-report.md` following
   `assets/outputs/audit-report.md`. Use JSONL outcomes as source of truth.

   **Severity rubric for "Priority fixes":**
   - **Critical** — style is broken: no frontmatter, empty body
   - **Important** — style unreliable: missing persona, no tone guidance,
     excessive hedges, CLAUDE.md contradiction
   - **Minor** — polish: missing description, no format guidance, possible
     role overlap with another style

6. **Chat summary** — one line only: `"Score X/12 — full report saved to
   outputs/audit-report.md"`. Do NOT paste the report.

## Fixing a style from frictions

### Read signals (in this order)

1. **Latest audit** — `outputs/audit-report.md`. Audit findings tell you
   what's structurally wrong.
2. **Aggregated project frictions** — `{project}/.nakiros/frictions/aggregate.json`.
   Look for friction types that map to missing style instructions (e.g.,
   `tone_inconsistency` → add explicit tone directive; `format_unexpected` →
   add format section).
3. **Existing style file** — read before adding content.

If `aggregate.json` doesn't exist, ASK: *"No friction aggregate found. Want
me to fix from audit findings only, or run the friction classifier first?"*

### Apply minimal edits

One friction → one targeted edit. Do not rewrite the whole style.

Cap the edit budget: if applying every fix would push the file over 200 lines,
stop, write a `fix-findings.jsonl` entry with code `SIZE_BUDGET_EXCEEDED`, and
ask which frictions to prioritize.

### Live progress artefacts (Nakiros-invoked only)

Write `outputs/fix-targets.jsonl` (one line per actionable fix, `todo` then
`done`) and `outputs/fix-findings.jsonl`. Do NOT add a `ts` field — Nakiros
stamps it.

### Sync CLAUDE.md routing tables

After applying the fix, invoke the claudemd-expert sync mode for uniformity
with sister experts (no-op for output styles today):

```
Skill('nakiros-claudemd-expert', 'sync')
```

## Best practices for output styles

- **Define a specific persona.** `"You are a senior TypeScript reviewer"` is
  better than `"You are helpful"`. Vague personas produce inconsistent output.
- **Explicit tone.** State tone, formality, and verbosity directly. Do not
  assume the persona implies these.
- **Explicit format.** State whether to use markdown, plain text, tables, or
  code blocks. Default format (markdown) is only obvious to developers.
- **Imperative mood.** `"Always"`, `"Never"`, `"Format X as Y"`. Not
  `"should consider"` or `"perhaps"`.
- **Under 200 lines.** A style is not a manual. If you need 300 lines, you
  have multiple personas in disguise — split them.
- **Description for the picker.** The `description:` field is displayed
  directly in `/config`. Make it informative: `"Senior engineer code review —
  direct, no cheerleading"` beats `"A code review style"`.
- **`keep-coding-instructions`** — set explicitly. Default `false` means the
  style body REPLACES the system prompt. Set `true` only if the style augments
  coding behavior rather than replacing it.
- **Unique role.** Before creating a new style, check if a similar one exists.
  Two styles with 70%+ role overlap confuse users in the `/config` picker.

## Evaluating styles (evals)

Same methodology as skill-factory. Test cases for `eval create` should cover:

- Style with clear persona, explicit tone, imperative mood (should score 11-12/12)
- Style with no `---` frontmatter (should detect critical fail)
- Style with excessive hedges (> 2 hedge patterns) (should detect warn fail)
- Style body with fewer than 5 meaningful lines (should detect critical fail)
- Style that contradicts CLAUDE.md on a behavioral point (should detect warn)
- Style with role that duplicates another style in the snapshot (should detect info)

Do NOT auto-create evals on `create`. Propose at the end.

## Gotchas

- `keep-coding-instructions: false` (default) means the style body **replaces**
  the coding system prompt. Always clarify intent before setting this.
- CLAUDE.md is appended as a user message **after** the style body — it cannot
  be suppressed by the style. Check snapshot before claiming a style conflicts.
- The `/config` picker shows `name:` (or filename) AND `description:` — both
  matter for usability.
- User-scope styles (`~/.claude/output-styles/`) are NOT audited in V1. If a
  user asks about user-scope styles, explain V1 limitation and defer.
- Plugin-scope styles are also out of scope for V1.
- Output styles are **always active** once selected — unlike skills (invoked)
  or hooks (triggered by events). A style with vague instructions affects every
  response in the session.

## Available commands

### Style management
- **"create"** → Clarify purpose, check overlap, generate from template
- **"audit"** → Audit a style against the 12-check list
- **"fix"** → Apply fixes from latest audit + aggregated frictions
- **"improve"** → Improve from user-described execution feedback

### Style evaluation
- **"eval create"** → Create test cases + fixtures
- **"eval run"** → Run tests, grade, produce benchmark
- **"eval analyze"** → Analyze results, propose improvements
- **"eval compare"** → Compare iterations (delta report)

## Edit mode

Triggered by `/nakiros-output-styles-expert edit`. The user wants to **modify an existing output style conversationally**, without an audit driving the changes.

1. Read the seeded output style at `./draft.md` to understand what currently exists.
2. Wait for the user's first message describing what to change.
3. Propose changes (Write/Edit tools on `./draft.md` only — Claude Code blocks writes inside `.claude/**`), explain trade-offs, iterate.
4. Re-read `./draft.md` after each substantive change to confirm the in-context view is current.
5. Stop and request user feedback when in doubt — edit is interactive, not autonomous.

No findings file, no audit manifest. The user's chat is the spec. Nakiros copies `./draft.md` to the final destination when the user clicks "Apply & Deploy"; you do not need to call `finish` yourself.
