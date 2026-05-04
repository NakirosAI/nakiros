# CLAUDE.md Audit Checklist (18 checks)

> Read `claudemd-spec.md` first for the rationale behind each rule.

Each check has an **id** (used as the `checkId` in `audit-progress.jsonl`), a **rubric** (how to decide pass/fail), a **severity** (critical/important/minor), and **N/A conditions** if any.

## Section: Size & Structure (4 checks)

### 1. `structure.line_count`
**Rubric**: File ≤ 200 lines (excluding code fences and frontmatter).
**Severity**: Critical if > 500 lines, Important if 200-500, pass if ≤ 200.
**N/A**: Never.
**Detail format**: `"{N} lines (target ≤ 200)"`

### 2. `structure.heading_hierarchy`
**Rubric**: Headings start at `#` (one only), no skipped levels (`#` → `###` is a skip), max depth `###`.
**Severity**: Important.
**N/A**: Never.
**Detail format**: `"Skipped # → ###"` or `"Max depth ####"` if fail.

### 3. `structure.bullet_depth`
**Rubric**: No nested bullets deeper than 2 levels.
**Severity**: Minor.
**N/A**: Never.
**Detail format**: `"3-level nesting at line N"` if fail.

### 4. `structure.section_size`
**Rubric**: No single section (`##` heading to next `##`) longer than 50 lines.
**Severity**: Important.
**N/A**: Never.
**Detail format**: `"Section '{name}' = {N} lines"` if fail.

## Section: Content categories (5 checks)

### 5. `content.architecture_pointers`
**Rubric**: A section or paragraph names where things live (top-level dirs OR a link to ARCHITECTURE.md / docs).
**Severity**: Important.
**N/A**: Never.
**Detail format**: `"No architecture pointers"` or `"Links to ARCHITECTURE.md"`.

### 6. `content.mandatory_constraints`
**Rubric**: At least one hard rule with imperative phrasing AND a concrete reference (file, function, env var, command).
**Severity**: Critical if file mentions IPC/security/auth domains and has zero constraints, Important otherwise.
**N/A**: Tiny throwaway projects with no real boundaries.
**Detail format**: `"{N} hard rules detected"` or `"No imperative constraints"`.

### 7. `content.quick_pointers`
**Rubric**: A "Gotchas", "Quick pointers", or equivalent section with at least one concrete project-specific trap.
**Severity**: Important.
**N/A**: Brand-new project with no execution history yet.
**Detail format**: `"{N} gotchas listed"` or `"No gotchas section"`.

### 8. `content.validation_commands`
**Rubric**: At least one runnable validation command (typecheck, build, test, lint) appears in a code fence.
**Severity**: Important.
**N/A**: Documentation-only repos with no build step.
**Detail format**: `"{N} validation commands listed"` or `"None found"`.

### 9. `content.runtime_stack`
**Rubric**: Runtime/language is identified at least implicitly (mention of pnpm, cargo, pytest, the language name, etc.).
**Severity**: Minor.
**N/A**: Never.
**Detail format**: `"Stack identified: {stack}"` or `"Stack ambiguous"`.

## Section: Tone & specificity (4 checks)

### 10. `tone.imperative_mood`
**Rubric**: Hard rules use imperative verbs ("Use", "Never", "Run"). Banned hedges: *consider, think about, be careful, appropriately, as needed, usually, generally, ideally, typically*. ≤ 2 hedges total → pass.
**Severity**: Important.
**N/A**: Never.
**Detail format**: `"{N} hedge words found: {list}"`.

### 11. `tone.no_fluff`
**Rubric**: No marketing language, no "welcome", no "awesome/world-class/cutting-edge". Banned tokens (case-insensitive): *welcome, awesome, world-class, cutting-edge, robust, scalable, beautiful, elegant*.
**Severity**: Minor.
**N/A**: Never.
**Detail format**: `"Marketing tokens: {list}"` or `"Clean"`.

### 12. `tone.no_verbose_why`
**Rubric**: No paragraph longer than 4 lines that explains *why* a rule exists. Reasoning belongs in linked docs.
**Severity**: Minor.
**N/A**: Never.
**Detail format**: `"Long explanation paragraph at line N"` if fail.

### 13. `tone.actionable_instructions`
**Rubric**: Every hard rule names a specific file/path/command/symbol. Banned: rules with only adjectives or adverbs ("write good code", "test thoroughly").
**Severity**: Important.
**N/A**: Never.
**Detail format**: `"{N} non-actionable bullets: e.g. '{first one}'"`.

## Section: Anti-patterns (3 checks)

### 14. `antipattern.vague_advice`
**Rubric**: No bullet matches the regex `(be careful|appropriately|edge cases|consider|make sure|think about|as needed)` without an immediate concrete clause naming a file/symbol.
**Severity**: Important.
**N/A**: Never.
**Detail format**: `"{N} vague bullets"`.

### 15. `antipattern.code_obvious`
**Rubric**: No bullet states something a glance at the codebase makes obvious (e.g. "we use TypeScript" with `tsconfig.json` present, "we use React" with `react` in deps).
**Severity**: Minor.
**N/A**: Cannot verify against actual codebase if running on detached file.
**Detail format**: `"{N} bullets restate code-obvious facts"`.

### 16. `antipattern.long_lists`
**Rubric**: No flat bullet list longer than 7 items without a section split.
**Severity**: Minor.
**N/A**: Never.
**Detail format**: `"List of {N} items at line {L}"` if fail.

## Section: Paths & references (2 checks)

### 17. `paths.unambiguous`
**Rubric**: No `./`-prefixed path. All paths are repo-relative (`apps/foo/...`) or absolute (`/Users/...`).
**Severity**: Minor.
**N/A**: Never.
**Detail format**: `"{N} ambiguous paths"`.

### 18. `paths.external_docs_linked`
**Rubric**: Long technical content (architecture, glossary, schema) is linked, not duplicated. If a section reproduces > 30 lines of what looks like ARCHITECTURE.md content → fail.
**Severity**: Minor.
**N/A**: No external docs exist yet.
**Detail format**: `"Architecture inlined ({N} lines)"` if fail.

## Scoring

- Total checks: **18**
- Pass = ✅ + N/A
- Fail = ❌
- A "passing audit" = no Critical ❌ + at most 2 Important ❌

The static-checks script handles checks 1, 2, 3, 4, 9, 11, 14, 16, 17 deterministically. The remaining 9 checks (5, 6, 7, 8, 10, 12, 13, 15, 18) require judgement and must be appended to `audit-progress.jsonl` by the agent.
