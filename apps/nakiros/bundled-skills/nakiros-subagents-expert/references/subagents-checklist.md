# Subagents Audit Checklist (15 checks)

> Read `subagents-spec.md` first for the rationale behind each check.

Each check has an **id** (used as the `checkId` in `audit-progress.jsonl`), a
**rubric** (how to decide pass/fail), a **severity**, and **N/A conditions** if
any.

---

## Section: Frontmatter (4 checks)

### 1. `frontmatter.present`
**Rubric**: File starts with a valid YAML frontmatter block (`---` ... `---`).
The block must be present and syntactically parseable as YAML (at minimum: a
`name:` key).
**Severity**: Critical.
**N/A**: Never — all subagents require frontmatter.
**Detail format**: `"No valid --- frontmatter block at file start"` if fail.

### 2. `frontmatter.name_format`
**Rubric**: The `name:` field in frontmatter matches `/^[a-z][a-z0-9-]*$/`.
- Lowercase letters and hyphens only
- Must start with a letter (not a digit or hyphen)
- No spaces, no underscores, no uppercase
**Severity**: Critical. An invalid name may fail to match in Claude Code's
resolver and silently break `@name` delegation.
**N/A**: Never.
**Detail format**: `"name: '{value}' fails /^[a-z][a-z0-9-]*$/"` if fail.

### 3. `frontmatter.description_present`
**Rubric**: The `description:` field is present in frontmatter and non-empty
(trim whitespace before checking). A subagent without a description will never
be auto-delegated to.
**Severity**: Warn.
**N/A**: Never.
**Detail format**: `"description: present and non-empty"` if pass;
`"description: field missing or empty"` if fail.

### 4. `frontmatter.description_actionable`
**Rubric**: The description contains at least one delegation keyword phrase:
- `use` (as in "use for", "use when", "use proactively")
- `for` (as in "for X tasks")
- `when` (as in "when asked to", "when working on")
- `proactively` (explicit auto-delegation signal)

Checked via case-insensitive regex: `/\b(use|for|when|proactively)\b/i`.
**Severity**: Warn.
**N/A**: Never — a description without delegation triggers is passive and
won't trigger auto-delegation.
**Detail format**: `"Delegation keywords found: {list}"` if pass;
`"No delegation keywords in description"` if fail.

---

## Section: Structure (3 checks)

### 5. `structure.line_count`
**Rubric**: File is ≤ 200 lines. A focused subagent system prompt should not
need more. Over 200 lines suggests multiple domains in one file.
**Severity**: Warn.
**N/A**: Never.
**Detail format**: `"{N} lines (target ≤ 200)"`.

### 6. `structure.body_present`
**Rubric**: There is a non-empty body after the closing `---` of the frontmatter
block. The body must have at least 5 non-blank lines. A subagent with no system
prompt provides zero behavioural guidance.
**Severity**: Critical.
**N/A**: Never — an empty-body subagent is functionally useless.
**Detail format**: `"Body present: {N} lines after frontmatter"` if pass;
`"No body after frontmatter (subagent has no system prompt)"` if fail.

### 7. `structure.heading_hierarchy`
**Rubric**: No skipped heading levels (e.g. H1 → H3 without H2). Maximum
depth is H3. Multiple H1s are allowed in subagent bodies (it is a system
prompt, not a doc with one title).
**Severity**: Warn.
**N/A**: Files with no headings pass by default (flat prose is acceptable).
**Detail format**: `"Heading hierarchy valid, max H{N}"` if pass;
`"Skipped from H{N} to H{M} at line {L}"` if fail.

---

## Section: Configuration (3 checks)

### 8. `config.model_specified`
**Rubric**: The `model:` field is present in frontmatter. Accepted values:
`sonnet`, `opus`, `haiku`, `inherit`, or any full model ID (e.g.
`claude-haiku-4-5-20251101`). If absent, the subagent inherits the parent
session's model — acceptable but an explicit choice is best practice.
**Severity**: Warn.
**N/A**: If the subagent body explicitly states why model choice is deferred
to the parent (rare — mark `na` with note).
**Detail format**: `"model: '{value}' specified"` if pass;
`"model: not specified — inherits from parent session"` if fail.

### 9. `config.tools_scoped`
**Rubric**: At least one of `tools:` (allowlist) or `disallowedTools:` (denylist)
is present in frontmatter. Inheriting all tools without restriction is a
best-practice violation — principle of least privilege.
**Severity**: Warn.
**N/A**: Subagents that genuinely require all available tools (e.g. a
general-purpose delegation target). Mark `na` if the body explicitly justifies
full tool access.
**Detail format**: `"tools: allowlist present"` / `"disallowedTools: denylist present"` if pass;
`"No tool scoping — subagent inherits all tools without restriction"` if fail.

### 10. `config.no_unjustified_bypass`
**Rubric**: `permissionMode: bypassPermissions` is either absent, OR if present,
the body contains an explicit justification explaining why bypass is needed.
Detection: search for `permissionMode: bypassPermissions` in frontmatter; if
found, scan the body for a justification phrase (e.g. "bypass permissions",
"requires full access", "intentionally elevated").
**Severity**: Critical — `bypassPermissions` removes all safety rails.
**N/A**: Never.
**Detail format**: `"permissionMode: bypassPermissions absent"` if pass (absent);
`"bypassPermissions present with body justification"` if pass (justified);
`"bypassPermissions present WITHOUT body justification — DANGEROUS"` if fail.

---

## Section: Content (3 checks)

### 11. `content.single_domain`
**Rubric**: The body describes one focused domain. Heuristic: count distinct
top-level domains mentioned in H1/H2 headings or the opening paragraph. If
more than 2-3 unrelated domains appear (e.g. "frontend UI" AND "database
migrations" AND "CI/CD pipelines"), flag as multi-domain.
**Severity**: Warn.
**N/A**: Subagents that are intentionally multi-capability coordination agents
(rare — should still be documented as such in the description).
**Detail format**: `"Single domain: '{inferred topic}'"` if pass;
`"Multiple unrelated domains detected: {list}"` if fail.

### 12. `content.imperative_mood`
**Rubric**: The body uses imperative verbs to instruct the subagent. Expected
tokens: *always*, *never*, *use*, *do*, *avoid*, *add*, *include*, *do not*,
*require*, *never*. At least 60% of bullet points or instruction lines should
open with or contain imperative verbs rather than passive/descriptive phrasing.
**Severity**: Warn.
**N/A**: Subagents whose bodies are purely reference tables or lists of facts
where imperative tone would read awkwardly (rare).
**Detail format**: `"Imperative mood prevalent"` if pass;
`"{N} instruction lines use passive/descriptive phrasing"` if fail.

### 13. `content.has_examples`
**Rubric**: The body contains at least one of:
- A fenced code block (`` ``` ``)
- A pattern like `"Example:"` or `"When asked to"` or `"When asked X, you..."`

Examples dramatically improve agent compliance with instructions.
**Severity**: Info.
**N/A**: Very short subagents (< 10 lines body) where a code example would
be artificial — mark `na` with note.
**Detail format**: `"Fenced code block found"` or `"Example: pattern found"` if pass;
`"No code block or example pattern found"` if fail.

> Note: This check is handled deterministically by `run-static-checks.mjs`.

---

## Section: Cross-entity (2 checks)

### 14. `crossref.referenced_in_claudemd`
**Rubric**: Check `snapshot.claudemd.content` for references to this subagent
by name (e.g. `@<name>` or the name in a routing table). If the subagent is
absent from CLAUDE.md, record as an info finding — "subagent not referenced in
CLAUDE.md. May be intentional if invoked only via @-mention." This is NOT
a failure — just an observation.
**Severity**: Info.
**N/A**: Projects without a CLAUDE.md at all — mark `na`.
**Detail format**: `"@{name} found in CLAUDE.md routing table"` if pass;
`"Subagent not mentioned in CLAUDE.md — verify delegation path"` if fail (info only).

### 15. `crossref.skills_exist`
**Rubric**: For each skill listed in the `skills:` frontmatter field, verify
that a skill with that exact name exists in `snapshot.skills[]`. A stale
skill reference causes a silent failure at startup (the skill is simply not
preloaded).
**Severity**: Warn.
**N/A**: Subagents with no `skills:` field — mark `na`.
**Detail format**: `"All {N} skills verified in snapshot"` if pass;
`"Skill '{name}' not found in snapshot.skills"` if fail.

---

## Scoring

- Total checks: **15**
- Pass = ✅ + N/A
- Fail = ❌
- A "passing audit" = no Critical ❌ + at most 2 Warn ❌

The static-checks script handles checks **1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13**
deterministically. The remaining **4 checks** (11, 12, 14, 15) require
judgement and must be appended to `audit-progress.jsonl` by the agent.
