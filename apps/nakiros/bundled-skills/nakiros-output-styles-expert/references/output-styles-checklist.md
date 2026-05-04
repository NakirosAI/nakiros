# Output Styles Audit Checklist — 12 Checks

Full rubrics for each check in the `nakiros-output-styles-expert` audit.

---

## Section: Frontmatter (3 checks)

All deterministic. Run via static script.

### `frontmatter.present` — Valid YAML frontmatter present
**Severity**: critical
**Method**: deterministic

**Pass condition**: File starts with `---` and has a closing `---` before the
first non-frontmatter content line.

**Fail condition**: No opening `---` at line 1, or no closing `---` found.

**Rubric**:
- `---` must be **exactly** at line 1 (no leading blank lines)
- The closing `---` must appear as its own line (no trailing characters)
- Content between the delimiters does not need to be valid YAML — presence of
  the block is enough for this check. YAML validity errors are surfaced as
  parse failures in the detail line.

**Finding code**: `FRONTMATTER_MISSING`

---

### `frontmatter.name_or_filename` — name: field present or filename is valid
**Severity**: info
**Method**: deterministic

**Pass condition**: `name:` field is present in frontmatter, OR the filename
(without `.md`) is a valid identifier (letters, digits, hyphens — no spaces,
no special chars).

**Fail condition**: `name:` absent AND filename contains spaces or
special characters that would render poorly in the `/config` picker.

**Rubric**:
- A valid filename like `code-review.md` is acceptable — Claude Code uses
  `code-review` as the display name
- A filename like `My Custom Style.md` (with spaces) is problematic — add
  `name:` to provide a clean display name
- Empty `name:` value (e.g. `name: ""`) counts as fail

**Finding code**: `NAME_MISSING_USING_FILENAME`

---

### `frontmatter.description_present` — description: field present and non-empty
**Severity**: warn
**Method**: deterministic

**Pass condition**: `description:` field is present in frontmatter with a
non-empty string value.

**Fail condition**: `description:` absent, or value is empty string / blank.

**Rubric**:
- The description is shown **directly in the `/config` picker** — missing or
  vague descriptions force users to open the file to understand what the style
  does
- Minimum useful length: ≥ 10 characters (one short phrase)
- Descriptions like `"A custom style"` are technically non-empty but useless;
  flag this as a detail note (not a fail) if the description is suspiciously
  generic

**Finding code**: `DESCRIPTION_MISSING`

---

## Section: Structure (3 checks)

All deterministic. Run via static script.

### `structure.line_count` — File ≤ 200 lines
**Severity**: warn
**Method**: deterministic

**Pass condition**: Total line count ≤ 200.

**Fail condition**: > 200 lines.

**Rubric**:
- 200 lines is generous — most well-structured styles fit in 50–100 lines
- Lines include frontmatter, blank lines, and comments
- If a style exceeds 200 lines, it likely mixes multiple concerns
- Detail should include the exact count: `"245 lines (> 200)"`

**Finding code**: `LINE_COUNT_EXCEEDED`

---

### `structure.body_present` — Body markdown after frontmatter (≥ 5 lines)
**Severity**: critical
**Method**: deterministic

**Pass condition**: At least 5 non-empty, non-frontmatter lines after the
closing `---` delimiter.

**Fail condition**: Body absent, empty, or fewer than 5 meaningful lines.

**Rubric**:
- "Meaningful" lines: non-blank, non-comment (`<!--...-->`), non-delimiter
- A 1-line body (`"You are concise."`) is technically present but provides
  almost no behavioral guidance — flag in detail
- Count only lines after the closing `---`

**Finding code**: `BODY_MISSING`

---

### `structure.heading_hierarchy` — No skipped heading levels, max H3
**Severity**: warn
**Method**: deterministic

**Pass condition**: Headings go H1 → H2 → H3 without skipping a level. No
H4+ headings.

**Fail condition**: Jump from H1 to H3, H2 to H4, etc.

**Rubric**:
- Styles don't need to have any headings (a short style may be a single
  paragraph persona) — absence of headings is a **pass**
- H4+ headings indicate over-structuring for what should be a brief document
- Multiple H1s are allowed (unlike rules), but are unusual — note in detail

**Finding code**: `HEADING_HIERARCHY_WRONG`

---

## Section: Content (4 checks)

Mix of deterministic heuristics and agent judgement.

### `content.role_defined` — Style defines a clear role or persona
**Severity**: warn
**Method**: deterministic heuristic

**Pass condition**: Body contains at least one role-trigger phrase:
`you are`, `tu es`, `act as`, `behave as`, `as a `, `as an ` (case-insensitive).

**Fail condition**: None of the above patterns found in the body.

**Rubric**:
- A style without a role persona tends to produce inconsistent behavior
- The heuristic is coarse — it will miss unusual persona openings. If static
  check fails but the style clearly defines a persona via another formulation,
  the agent should override to `pass` with a note
- Examples of valid openers: `"You are a senior engineer"`, `"Act as a patient
  teacher"`, `"You serve as a documentation writer"`

**Finding code**: `ROLE_NOT_DEFINED`

---

### `content.tone_specified` — Style specifies tone, formality, or verbosity
**Severity**: warn
**Method**: agent judgement

**Pass condition**: The style body explicitly mentions at least one of:
tone (formal/informal/direct/friendly), formality level, verbosity
(concise/detailed/brief), or response length guidance.

**Fail condition**: No explicit tone or verbosity guidance found anywhere.

**Rubric**:
- Implicit tone (from a persona description) can be enough: `"You are a terse
  command-line tool"` implies brevity
- Explicit statements are better: `"Always keep responses under 5 lines"`,
  `"Respond in a formal, academic tone"`
- A style that is silent on tone/verbosity is a warn, not a critical fail

**Finding code**: `TONE_NOT_SPECIFIED`

---

### `content.format_specified` — Style specifies expected output format
**Severity**: info
**Method**: agent judgement

**Pass condition**: The style body mentions at least one output format
preference: markdown, code blocks, bullet lists, plain prose, tables, etc.

**Fail condition**: No format guidance whatsoever.

**Rubric**:
- This is info severity because format preferences are inheritable from the
  persona (e.g. `"You are a plain-text email composer"` implies no markdown)
- Explicit is better than implicit: `"Always format code samples in fenced
  markdown blocks"` leaves no ambiguity
- Consider the style's purpose — a "learning mode" style probably wants
  structured output; a "terse CLI" probably wants plain text

**Finding code**: `FORMAT_NOT_SPECIFIED`

---

### `content.imperative_mood` — Uses imperative mood without excessive hedges
**Severity**: warn
**Method**: deterministic heuristic

**Pass condition**: Fewer than 3 hedge patterns in the body prose.

**Fail condition**: 3 or more distinct hedge occurrences.

**Hedge patterns** (case-insensitive):
- `should consider`
- `may want to`
- `might be helpful`
- `consider doing`
- `perhaps`
- `you might`
- `ideally`

**Rubric**:
- Count hedge occurrences in prose only (not inside code fences)
- Up to 2 hedges is acceptable (e.g. one conditional behavior statement)
- 3+ hedges usually indicate the style was written with uncertainty — it will
  produce inconsistent agent behavior
- Detail should list the hedge phrases found

**Finding code**: `HEDGES_DETECTED`

---

## Section: Cross-entity (2 checks)

Both require agent judgement + snapshot data.

### `crossref.no_conflict_with_claudemd` — Style does not frontally contradict CLAUDE.md
**Severity**: warn
**Method**: agent judgement (requires snapshot)

**Pass condition**: No direct contradiction found between style instructions
and `snapshot.claudemd.content`.

**Fail condition**: A clear, direct contradiction on a substantive point.

**Rubric**:
- A **direct contradiction** is: style says `"Never explain your reasoning"`
  AND CLAUDE.md says `"Always justify architectural decisions"`. Both cannot
  be followed simultaneously.
- A **complementary constraint** is NOT a conflict: style says `"Be terse"` AND
  CLAUDE.md says `"Use English in all code" ` — these coexist fine.
- Additive vs. contradictory: CLAUDE.md is appended as a user message AFTER
  the style body, so CLAUDE.md instructions win in case of tension unless the
  style explicitly addresses the same point.
- If `dot-claude-snapshot.json` is absent or `claudemd.content` is empty,
  mark as `na`.

**Finding code**: `CONFLICT_WITH_CLAUDEMD`

---

### `crossref.unique_role` — No major role overlap with another output-style
**Severity**: info
**Method**: agent judgement (requires snapshot)

**Pass condition**: No other style in `snapshot.outputStyles` has a
substantially identical role/persona.

**Fail condition**: Another style defines the same primary role with similar
behavioral constraints (> 70% conceptual overlap).

**Rubric**:
- Minor overlap is expected and acceptable (two "concise" styles can coexist
  if they differ in other dimensions)
- Flag when roles are nearly identical AND both are in the project scope (user
  scope is lower priority to check)
- If `snapshot.outputStyles` has 0 or 1 items (the style being audited),
  mark as `na`.
- Suggest merging or differentiating in the Priority fixes section if flagged

**Finding code**: `ROLE_OVERLAP_DETECTED`
