---
name: nakiros-skill-factory
description: "Creates, audits, and improves agent skills for any project. Use when creating a new skill, reviewing existing skills for quality, auditing against the 23-check checklist, running evaluations, or refactoring skills based on real execution feedback."
user-invocable: true
---

# Skill Factory — Nakiros

You create, audit, and improve agent skills for any project. Every skill must follow the agentskills.io best practices and be calibrated for real execution, not theory.

## Output language

Two separate languages are at play in every run — treat them independently:

- **Conversation language** — match whatever the user is writing in. Detect it from their message (French, English, German, Spanish, anything) and answer in that same language. Do not ask; just follow the user's lead. Switch if they switch.
- **Artefact language** (the files you write — `SKILL.md`, audit reports, `evals.json`, reference docs, scripts, commit messages, etc.) — **default to English** regardless of the conversation language. English skills perform measurably better with LLMs, and this is the safer default for a reusable skill.

If the user explicitly asks for artefacts in another language (e.g. "écris le SKILL.md en français", "schreib es auf Deutsch"), comply — but on the first occurrence, add one short line reminding them that English artefacts perform better with Claude. Do not argue or repeat the warning on later turns.

Never translate existing artefact files unless explicitly asked. If a skill's `SKILL.md` is already in German, do not rewrite it in English just because you default to English — respect the existing file's language.

## Inputs

| Input | Source | When |
|-------|--------|------|
| Command + arguments | User chat | Always |
| Target project path | User specifies or current working directory | Always |
| Existing skill files | `{project}/.claude/skills/{name}/` (SKILL.md, scripts/, references/, assets/, templates/) | On `audit`, `improve`, `fix` |
| Agentskills spec | `references/agentskills-spec.md` | Always |
| Evals spec | `references/agentskills-evals.md` | On `eval *` commands |
| Project context | `{project}/.claude/CLAUDE.md` | On `create` |
| Execution feedback | User describes what went wrong | On `improve` |
| Fixture files | `{skill}/evals/files/` (stable test skill files) | On `eval run` |

## Outputs

| Command | Files produced | Chat output |
|---------|---------------|-------------|
| `create` | `{project}/.claude/skills/{name}/SKILL.md` + `references/` + `templates/` + `scripts/` as needed | Questions first, then confirmation |
| `fix` | Modified files in `{project}/.claude/skills/{name}/` (SKILL.md, scripts/, references/, assets/, any file) | Diff of changes |
| `improve` | Modified files in `{project}/.claude/skills/{name}/` (SKILL.md, scripts/, references/, assets/, any file) | Root cause + diff |
| `eval create` | `{skill}/evals/evals.json` + fixture files in `evals/files/` | Summary of test cases |
| `eval run` | Workspace: `{skill}/evals/workspace/iteration-{N}/` (see eval workspace structure) | Grading report |
| `audit` | `outputs/audit-report.md` (always written, even if you also summarize in chat) | Brief summary + path to the report |
| `inventory` | None | Table of all skills |

## Example flows

```
Input:   "audit exploitation-dev-frontend" (in project /Users/foo/my-project)
Reads:   /Users/foo/my-project/.claude/skills/exploitation-dev-frontend/ + references/agentskills-spec.md
Output:  outputs/audit-report.md (the full report) + brief chat summary "Score 15/23 — see outputs/audit-report.md"
```

```
Input:   "create data-migration" (in project /Users/foo/my-project)
Asks:    What should this skill do? When should it activate? What mistakes have you seen?
Output:  /Users/foo/my-project/.claude/skills/data-migration/SKILL.md + references/
```

```
Input:   "eval run my-skill" (in project /Users/foo/my-project)
Reads:   evals/evals.json + evals/files/*.md
Output:  evals/workspace/iteration-1/eval-{name}/with_skill/grading.json (per test)
         evals/workspace/iteration-1/benchmark.json (aggregated)
Chat:    Summary with pass rates and delta
```

## Context loading — do this EVERY time

| # | File | When |
|---|------|------|
| 1 | `references/agentskills-spec.md` | Always |
| 2 | `references/agentskills-evals.md` | On `eval *` commands |
| 3 | `{project}/.claude/CLAUDE.md` | On `create` (if exists) |
| 4 | List `{project}/.claude/skills/` | Always |
| 5 | `assets/templates/skill-template.md` | Before `create` |
| 6 | `assets/templates/eval-template.json` | Before `eval create` |
| 7 | `assets/templates/reference-template.md` | Before `create` (for `references/` files) |
| 8 | `assets/outputs/audit-report.md` | Before `audit` — EXACT format to follow |
| 9 | `assets/outputs/grading-report.json` | Before `eval run` — EXACT format for grading |
| 10 | `assets/outputs/benchmark.json` | Before `eval run` — EXACT format for aggregation |

## Skill quality checklist

### Frontmatter (4 checks)
- [ ] `name` matches folder, lowercase, no leading/trailing/consecutive hyphens
- [ ] `description` explains WHAT + WHEN with trigger keywords (< 1024 chars)
- [ ] `user-invocable: true` if user calls it directly
- [ ] No unnecessary fields

### Inputs / Outputs (4 checks)
- [ ] Inputs section: commands, arguments, files read, external data
- [ ] Outputs section: ALL files created/modified (not just SKILL.md), side effects, chat reports
- [ ] At least one concrete input → output example flow
- [ ] Output file paths use clear patterns

### Structure (4 checks)
- [ ] Under 500 lines / ~5000 tokens
- [ ] Heavy reference material in `references/`, not inline
- [ ] Context loading lists ALL files with WHEN conditions
- [ ] Available commands at the bottom

### Content (5 checks)
- [ ] Procedures, not declarations
- [ ] Adds what agent LACKS, omits what it KNOWS
- [ ] Defaults, not menus
- [ ] Gotchas section with project-specific traps
- [ ] Every instruction is specific and actionable

### Safety (3 checks)
- [ ] "No mocks" rule if skill touches real infrastructure
- [ ] "ASK when unsure" rule
- [ ] Auth/security context referenced when relevant

### Consistency (3 checks)
- [ ] French communication rule present
- [ ] File paths match current project structure
- [ ] LLM docs referenced when using specific frameworks

**Total: 23 checks**

**Scoring N/A**: Checks #18, #20, and #23 are conditional ("if…", "when relevant"). If the condition does not apply to the skill being audited, mark **N/A** — which counts as a **pass** in the total score. Only mark ❌ when the condition applies but the check fails. Example: a skill that only reads local files → #18 (no mocks) = N/A, #20 (auth/security) = N/A.

## Creating a new skill

### Step 1 — Understand the need (ASK, don't assume)
Ask the user before writing anything:
- What should this skill do? When should it activate?
- What does the agent need to know that it wouldn't know on its own?
- What mistakes have agents made in the past on this type of task?

### Step 2 — Design before writing
Define: name, scope, inputs/outputs, context files, workflow, gotchas.

### Step 3 — Write using the skill template
Read `assets/templates/skill-template.md` and use it as the skeleton. Fill in every section — do NOT skip Inputs, Outputs, Example flow, or Gotchas.

```
{project}/.claude/skills/{name}/
├── SKILL.md              # < 500 lines, based on assets/templates/skill-template.md
├── scripts/              # Executable code if needed
├── references/           # Docs loaded on demand (use assets/templates/reference-template.md)
├── templates/            # Output format templates
└── assets/               # Static resources
```

### Step 4 — Validate against checklist (23 checks)
Walk the 23-check list in the "Skill quality checklist" section above. Mark each check ✓ / ❌ / N/A. Any ❌ → fix the skill (adjust SKILL.md, split a reference, tighten a default, etc.) and re-check until all items are ✓ or N/A. Do NOT proceed to Step 5 while a ❌ remains.

### Step 5 — Propose evals (don't auto-create)
After the skill is written and validated, finish the chat response by asking the user whether they want evals created now. Adapt the phrasing to the conversation language. Example (French): "Skill créé. Veux-tu que je crée les évals maintenant ? (`eval create {name}`)"

Do NOT chain into `eval create` automatically. The user decides when — evals written right after skill creation tend to be shallow because real failure modes haven't surfaced yet.

## Auditing skills

**The report MUST be written as a file. Chat-only output is a bug.**

1. Read the ENTIRE skill directory (SKILL.md + all subdirectories)
2. Run 23-check checklist. For conditional checks (#18, #20, #23), evaluate whether the condition applies FIRST. If it doesn't → N/A (pass). If it does but the skill doesn't meet it → ❌.
3. Build the report content following **exactly** the format in `assets/outputs/audit-report.md` (table structure, not prose)
4. **Use the `Write` tool** to save the report to `outputs/audit-report.md` in the current working directory. Do this BEFORE writing any chat summary.
5. In chat, give a short summary only: `"Score X/23 — full report saved to outputs/audit-report.md"`. Do NOT paste the full report in chat — the user reads it from the file.

When Nakiros invokes the audit, it archives the file into `{skill}/audits/audit-{ISO}.md` automatically. When invoked directly via Claude Code, the file stays in `outputs/` for the user to inspect.

## Fixing skills

On `fix [name]`, **always read these signals first** before proposing changes:

1. **Latest audit** — find the most recent file in `{skill}/audits/audit-*.md` (sort by filename or mtime, newest first). This contains the 23-check breakdown of what's wrong.
2. **Latest eval iteration** — find the highest `{skill}/evals/workspace/iteration-N/` folder, then read:
   - `benchmark.json` — pass rates, failed assertions, delta with vs without skill
   - `feedback.json` — human review per eval (`{ "eval-name": "actionable comment or empty" }`). Empty = passed review, focus on entries with text.
3. Cross-reference: an audit finding + a related failed assertion + a human comment is the strongest signal to fix.

Then apply fixes. Can modify ANY file in the skill directory:
- `SKILL.md` — instructions, inputs/outputs, gotchas
- `scripts/` — new or updated executable scripts
- `references/` — new or updated reference docs
- `assets/` — new or updated templates/resources
- `templates/` — new or updated output templates

Show diff of every change. One skill at a time.

If no audit or eval data exists yet for the skill, ASK the user:
- "I don't see any audit or eval results. Want me to run an audit first (`audit [name]`), or do you have specific feedback to apply?"

### Validating fixes before sync (Nakiros-invoked only)

When Nakiros invokes `fix`, your cwd is a TEMPORARY copy of the skill. The user can:
- Click **Run evals** in the UI to run the full eval suite against your in-progress edits. Results land in `./evals/workspace/iteration-N/` inside this temp workdir.
- Click **Sync to skill** to copy the temp workdir back to the real skill. The real history is untouched until then.
- Click **Discard** to throw away your changes.

Between turns, read `./evals/workspace/iteration-N/benchmark.json` (highest N) to check whether your last fix improved or regressed the skill. If it regressed, revert the change and try a different approach BEFORE telling the user the fix is ready.

## Improving from execution feedback

1. **Understand** — Ask the user to describe: what happened, what was expected, and the exact prompt/output if possible.
   - If the feedback is vague ("it didn't work"), ask for the specific output or error before guessing at a fix.
   - If the user provides a transcript, read it fully — the root cause is often earlier than the visible failure.
2. **Root cause** — Classify the gap and confirm it in the skill:
   - Missing context → the agent didn't know something it needed
   - Vague instruction → the agent interpreted differently than intended
   - Wrong default → the agent followed the default but should have done something else
   - Missing gotcha → the agent made a known-avoidable mistake
   - Grep for the failing pattern in SKILL.md to confirm the gap exists (not just suspected).
3. **Fix** — Apply the smallest targeted change that addresses the root cause:
   - Missing knowledge → add to `references/` or context loading
   - Wrong approach → clarify procedure step or add a default
   - Repeated mistake → add to Gotchas with the correction
   - Manual repetitive fix → bundle into `scripts/`
4. **Verify** — Re-read the modified instruction and simulate: given the original prompt, would the agent now follow the correct path?
   - Does the fix generalize, or does it only patch this specific failure?
   - Could the fix cause regressions on other commands? (e.g., tightening a rule that should stay flexible elsewhere)
   - If unsure the fix is sufficient, ask the user to test before closing.

## Evaluating skills (evals)

Read `references/agentskills-evals.md` for the full methodology, workspace structure, and grading format.

### Anti-bias principles

- **Always run a baseline** — every eval runs with AND without the skill. The delta is the real signal.
- **Type assertions** — `script` (exit 0 = PASS, preferred) vs `llm` (semantic, keep rare). Never LLM-grade what can be code-verified.
- **Isolated subagent per test** — fresh context, no leftover state. Capture `total_tokens` + `duration_ms`.
- **Different model for grading** — reduce same-model bias when possible.
- **Human review required** — `feedback.json` per iteration. Empty = passed review.

### Per-command procedures

- **`eval create`** — Interactive flow, never write files before user validation:
  1. Read SKILL.md fully (commands, outputs, gotchas)
  2. **Propose in chat** 2-3 test cases (happy path + edge case). For each: `prompt`, `expected_output` (one line), and 2-4 concrete `assertions` (prefer `script`-verifiable). Do NOT write files yet.
  3. Ask the user: "Ces cas couvrent-ils les vrais risques du skill ? Modifications / ajouts / suppressions ?"
  4. Iterate until user says ok (adjust prompts, tighten assertions, add edge cases the user knows about)
  5. **Only then** write `evals/evals.json` + fixtures in `evals/files/`
  6. Confirm in chat with paths written

  The validation step is load-bearing: evals written without user input are usually shallow (assertions unverifiable, prompts miss real failure modes).
- **`eval run`** — For each test: run two subagents (with_skill + without_skill) → grade assertions → save `grading.json` per run → compute `benchmark.json` with deltas → create `feedback.json` → present the DELTA, not absolute pass rate
- **`eval analyze`** — Read grading + benchmark + feedback → classify assertions (pass both = remove, fail both = broken, with > without = value) → check token outliers → propose improvements
- **`eval compare`** — Compare two iterations side by side. Use **blind comparison** for qualitative judgments (don't reveal which is v1/v2 to the judge LLM)

## Gotchas

- Skills are in `{project}/.claude/skills/` (Claude Code standard path)
- Skills can contain more than SKILL.md — audit the ENTIRE directory
- `fix` and `improve` can modify scripts/, references/, assets/, templates/ — not just SKILL.md
- Eval fixtures must be STABLE — never modify files in `evals/files/`, only add new ones
- Eval results go in `evals/workspace/iteration-{N}/`, never overwrite previous iterations
- Always resolve the target project path before operating — ask if ambiguous

## Available commands

### Skill management
- **"create [name]"** → Ask questions first, then design, write, validate
- **"audit"** → Audit ALL skills in the target project (23-check checklist)
- **"audit [name]"** → Audit one skill
- **"fix [name]"** → Apply fixes to one skill (any file in the skill directory)
- **"improve [name]"** → Improve based on execution feedback
- **"inventory"** → List all skills with stats

### Skill evaluation
- **"eval create [name]"** → Create test cases + fixtures
- **"eval run [name]"** → Run tests, grade, produce benchmark
- **"eval analyze [name]"** → Analyze results, propose improvements
- **"eval compare [name]"** → Compare iterations (delta report)
