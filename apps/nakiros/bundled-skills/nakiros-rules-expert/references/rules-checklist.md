# Rules Audit Checklist (15 checks)

> Read `rules-spec.md` first for the rationale behind each rule.

Each check has an **id** (used as the `checkId` in `audit-progress.jsonl`), a
**rubric** (how to decide pass/fail), a **severity**, and **N/A conditions** if
any.

---

## Section: Frontmatter (4 checks)

### 1. `frontmatter.present`
**Rubric**: File starts with a valid YAML frontmatter block (`---` ... `---`).
The block must be syntactically parseable (at minimum: a top-level key `paths`
with a YAML list value).
**Severity**: Critical.
**N/A**: Only if the rule is intentionally global (no path scoping needed) AND
the team has explicitly decided not to require frontmatter. Very rare.
**Detail format**: `"No valid --- frontmatter block at file start"` if fail.

### 2. `frontmatter.paths_field`
**Rubric**: The frontmatter contains a `paths:` key whose value is a non-empty
YAML array. Each element should be a valid glob string (e.g. `"**/*.ts"`).
**Severity**: Critical. A rule without `paths:` loads on every session — this
is almost always unintentional for large projects.
**N/A**: Intentionally global rules (e.g. a "commit message style" rule that
applies everywhere). Mark `na` and note in detail.
**Detail format**: `"paths: key missing or empty"` if fail; list first 3 globs if pass.

### 3. `frontmatter.description_present`
**Rubric**: The rule's subject is clear from either:
- A `description:` key in frontmatter, OR
- An H1 heading (`#`) that summarises the topic in plain language.
Generic titles like `# Notes` or `# General` fail this check.
**Severity**: Warn.
**N/A**: Never.
**Detail format**: `"H1 present and descriptive: '{title}'"` or `"No descriptive title/description"`.

### 4. `frontmatter.no_unknown_keys`
**Rubric**: Only recognised frontmatter keys are used. Known keys: `paths`,
`description`, `name`, `title`. Any other key (e.g. `author`, `version`,
`enabled`) is unknown and likely has no effect in Claude Code.
**Severity**: Warn.
**N/A**: Never.
**Detail format**: `"Unknown keys: {list}"` if fail; `"All keys recognised"` if pass.

---

## Section: Structure (3 checks)

### 5. `structure.line_count`
**Rubric**: File is ≤ 150 lines. Rules are more focused than CLAUDE.md — if a
rule exceeds 150 lines it is likely covering multiple topics.
**Severity**: Warn (fail at > 150; hard fail note at > 200).
**N/A**: Never.
**Detail format**: `"{N} lines (target ≤ 150)"`.

### 6. `structure.heading_hierarchy`
**Rubric**: Exactly **one** H1 heading serves as the rule title. No skipped
levels (e.g., H1 → H3 without H2 is invalid). Max depth H3.
**Severity**: Warn.
**N/A**: Never (even very short rules should have an H1 title).
**Detail format**: `"Multiple H1 headings"` or `"Skipped H1→H3"` if fail.

### 7. `structure.section_size`
**Rubric**: No single section (from a `##` heading to the next `##` or EOF) is
longer than 40 lines. Rules should be concise. A section > 40 lines is a sign
of scope creep.
**Severity**: Warn.
**N/A**: Rules with no `##` sections (single-block rules are fine).
**Detail format**: `"Section '{name}' = {N} lines (> 40)"` if fail.

---

## Section: Tone (3 checks)

### 8. `tone.imperative_mood`
**Rubric**: Hard rules use imperative verbs. Expected tokens: *must*, *always*,
*never*, *use*, *avoid*, *do not*, *require*, *add*, *include*. Judgement check:
scan the prose bullets. At least **70% of imperative-style bullets** should open
with or contain one of these verbs rather than passive or descriptive phrasing.
**Severity**: Warn.
**N/A**: Rules that are primarily reference (e.g. a pure naming convention table)
where imperative tone would read awkwardly.
**Detail format**: `"{N} non-imperative bullets"` if fail.

### 9. `tone.no_fluff`
**Rubric**: No marketing language. Banned tokens (case-insensitive): *welcome*,
*awesome*, *world-class*, *cutting-edge*, *robust*, *scalable*, *seamless*,
*state-of-the-art*, *elegant*, *beautiful*.
**Severity**: Info.
**N/A**: Never.
**Detail format**: `"Marketing tokens found: {list}"` if fail; `"No fluff tokens"` if pass.
> Note: This check is handled deterministically by `run-static-checks.mjs`.

### 10. `tone.actionable`
**Rubric**: Each bullet is actionable — it tells the agent exactly what to do
or not do. Banned phrases without an immediate concrete clause: *consider*,
*as needed*, *ideally*, *typically*, *usually*, *generally*, *think about*,
*be careful*, *make sure*. A bullet that uses one of these AND immediately
names a file/symbol/command still passes.
**Severity**: Warn.
**N/A**: Never.
**Detail format**: `"{N} vague bullets without concrete reference"` if fail.
> Note: This check is handled deterministically by `run-static-checks.mjs`.

---

## Section: Content (3 checks)

### 11. `content.single_topic`
**Rubric**: The rule covers **one** focused subject. Signs of multi-topic
rules: unrelated `##` sections (e.g. "Testing" + "Database" in the same file),
two distinct `paths:` glob patterns that target completely different file types,
or a filename like `misc.md` or `general.md`. Judgement call.
**Severity**: Warn.
**N/A**: Rules that cover closely related sub-topics of the same concern (e.g.
"TypeScript strict mode" covering both `tsconfig.json` flags AND import style).
**Detail format**: `"Single topic: {inferred topic}"` if pass; `"Multiple unrelated topics detected"` if fail.

### 12. `content.has_examples`
**Rubric**: At least one fenced code block OR multiple inline code spans that
illustrate the rule concretely. Example code is the single best predictor of
agent compliance — abstract rules without examples are followed less reliably.
**Severity**: Warn.
**N/A**: Rules that are purely declarative lists of identifiers where code
would be redundant (very rare).
**Detail format**: `"Fenced code block found"` or `"No code examples"` if fail.
> Note: This check is handled deterministically by `run-static-checks.mjs`.

### 13. `content.no_obvious_restatement`
**Rubric**: The rule does not spend bullets restating conventions that are
obvious from the codebase (e.g. "we use TypeScript" when `tsconfig.json` exists,
"use async/await" in a Node ESM project). If you cannot imagine an agent
violating a bullet — it's probably obvious.
**Severity**: Info.
**N/A**: Cannot be fully verified without context; use best judgement.
**Detail format**: `"{N} bullets appear to restate obvious facts"` if fail.

---

## Section: Cross-entity (2 checks)

### 14. `crossref.paths_match_files`
**Rubric**: Each glob pattern in `paths:` matches at least one real file in the
repository. Use `find` or `glob` to verify. A glob that matches zero files will
never trigger the rule — it is dead code.
**Severity**: Warn. Exception: for brand-new repos where the target files
don't exist yet, mark `na` and note.
**N/A**: New repos where target files have not been created yet.
**Detail format**: `"All {N} globs match files"` if pass; `"Glob '{pattern}' matches no files"` if fail.
**How to check**: Compare each glob against `snapshot.rules[].paths` real-file lists, or run `find` / `glob` in the repo.

### 15. `crossref.no_path_overlap`
**Rubric**: No other rule in the project has significantly overlapping `paths:`
globs with this one. Overlapping rules are not an error (both load), but the
agent may receive contradictory instructions. Significant overlap = > 50% of
files matched by one glob are also matched by another rule's glob.
**Severity**: Info.
**N/A**: Never (even mild overlap is worth flagging as info).
**Detail format**: `"paths: overlap with rule '{other-rule}' on pattern '{glob}'"` if fail.
**How to check**: Compare `paths:` lists from `snapshot.rules[]` to find matches.

---

## Scoring

- Total checks: **15**
- Pass = ✅ + N/A
- Fail = ❌
- A "passing audit" = no Critical ❌ + at most 2 Warn ❌

The static-checks script handles checks **1, 2, 4, 5, 6, 7, 9, 10, 12**
deterministically. The remaining **6 checks** (3, 8, 11, 13, 14, 15) require
judgement and must be appended to `audit-progress.jsonl` by the agent.
