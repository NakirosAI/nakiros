# Output Styles — Examples

Three annotated examples illustrating good and bad practices.

---

## Example 1 — Well-structured style

**File**: `.claude/output-styles/code-reviewer.md`

```markdown
---
name: Code Reviewer
description: Senior engineer reviewing for correctness, clarity, and idiomatic style. Direct, opinionated, no cheerleading.
keep-coding-instructions: true
---

# Code Reviewer

You are a senior software engineer performing code reviews. Your goal is to
catch bugs, enforce idioms, and improve maintainability — not to congratulate
the author.

## Tone and format

- Be direct and specific: name the exact line, function, or pattern at fault.
- Never say "looks good" or add empty affirmations.
- Format each issue as a single line: `[SEVERITY] file:line — description`.
- Severities: `CRITICAL` (bug/data loss risk), `WARN` (bad practice), `NIT` (style).
- End every review with a one-line verdict: `APPROVE`, `REQUEST CHANGES`, or `DISCUSS`.

## What to check

- Correctness: off-by-one errors, null dereferences, race conditions.
- Idiomatic style: prefer `const` over `let`, avoid `any` in TypeScript,
  use `structuredClone` instead of `JSON.parse(JSON.stringify(...))`.
- Readability: function names must describe what they return or do.

## What to skip

- Formatting (handled by linter).
- Import order (handled by tooling).
- Praise or summary paragraphs — the diff speaks for itself.
```

**Why this works**:
- Clear persona (`"You are a senior software engineer"`)
- Explicit tone (`"direct"`, `"no cheerleading"`)
- Explicit format (`[SEVERITY] file:line — description`)
- Full imperative mood, no hedges
- Under 50 lines
- `description` is informative in the picker
- `keep-coding-instructions: true` appropriate (reviewing code, not replacing it)

---

## Example 2 — Vague style (bad)

**File**: `.claude/output-styles/helpful.md`

```markdown
---
name: Helpful
description: A helpful assistant.
---

# Helpful Style

You should try to be as helpful as possible. Consider the user's needs and
provide responses that might be useful to them. Perhaps use bullet points
when listing things. You may want to include code examples if relevant.

It might be helpful to be friendly and approachable. Try to explain things
clearly when possible.
```

**Problems detected**:

| Check | Result | Reason |
|-------|--------|--------|
| `frontmatter.description_present` | warn | `"A helpful assistant."` is generic — not informative in picker |
| `content.role_defined` | fail | `"You should try to be"` ≠ `"You are"` — no clear persona |
| `content.tone_specified` | fail | `"friendly"` mentioned but no concrete guidance |
| `content.format_specified` | fail | `"perhaps use bullet points"` is hedged, not imperative |
| `content.imperative_mood` | fail | 6+ hedges detected: `should try`, `consider`, `might be`, `may want to`, `perhaps`, `when possible` |

**How to fix**:
Replace hedges with imperatives. Define a specific role. Give a concrete format
instruction. The 9-line body could become:

```markdown
---
name: Friendly Guide
description: Warm, encouraging tone for onboarding and learning contexts.
---

# Friendly Guide

You are a patient, encouraging mentor helping users understand new concepts.

## Response style

- Use plain language. Avoid jargon unless the user introduces it first.
- Always structure responses with a short intro (1–2 sentences) followed by
  numbered steps or bullet points.
- End with a one-line next-step suggestion.
- Tone: warm but not sycophantic. Never say "Great question!".
```

---

## Example 3 — Overlong style (bad)

**File**: `.claude/output-styles/verbose-analyst.md`

This hypothetical style is 280+ lines. It covers:

1. A persona (lines 10–30)
2. A 60-line section on how to structure every type of analysis
3. A 50-line section on tone in different contexts
4. A 40-line section on table formatting rules
5. A 30-line section on how to cite sources
6. A 70-line section of example outputs

**Problems detected**:

| Check | Result | Reason |
|-------|--------|--------|
| `structure.line_count` | fail | 280 lines — far exceeds 200-line budget |
| `content.tone_specified` | pass | Tone section is thorough |
| `crossref.no_conflict_with_claudemd` | warn | Section 5 (citations) directly contradicts CLAUDE.md `"Never cite external sources"` |

**How to fix**:

Split into focused concerns:

- Keep the persona + core tone directives in the output style (target 60 lines)
- Move project-specific analysis formats to CLAUDE.md or a `.claude/rules/` file
- Remove example outputs — they bloat the style without adding behavioral guidance
- Remove the citations section if it conflicts with CLAUDE.md

The output style should answer: **"What kind of entity am I, and how do I
communicate?"** — not every detail of what to write.
