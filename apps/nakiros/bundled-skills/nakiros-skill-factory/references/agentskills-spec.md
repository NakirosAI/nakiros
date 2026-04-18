# Agent Skills — Specification + Best Practices

> Sources: https://agentskills.io/specification + https://agentskills.io/skill-creation/best-practices

## SKILL.md Format

### Frontmatter (YAML)

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | Max 64 chars. Lowercase, numbers, hyphens only. Must match folder name. |
| `description` | Yes | Max 1024 chars. What the skill does AND when to use it. Include trigger keywords. |
| `license` | No | License name or reference. |
| `compatibility` | No | Max 500 chars. Environment requirements. |
| `metadata` | No | Arbitrary key-value map. |
| `allowed-tools` | No | Space-separated pre-approved tools (experimental). |

### Name rules
- 1-64 characters
- Lowercase alphanumeric + hyphens only
- No leading/trailing/consecutive hyphens
- Must match parent directory name

### Description rules
- Must explain WHAT the skill does AND WHEN to use it
- Include specific keywords that help agents identify relevant tasks
- Bad: "Helps with PDFs"
- Good: "Extracts text and tables from PDF files, fills PDF forms. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction."

### Body
- Markdown after frontmatter
- **Under 500 lines / 5000 tokens recommended** (core instructions only)
- Heavy reference material goes in `references/`, `scripts/`, `assets/`

## Directory Structure

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation loaded on demand
├── assets/           # Optional: templates, resources
└── templates/        # Optional: output templates
```

## Progressive Disclosure

3 levels — agents load progressively:

1. **Metadata** (~100 tokens): name + description loaded at startup for ALL skills
2. **Instructions** (< 5000 tokens): Full SKILL.md loaded when skill activates
3. **Resources** (as needed): Files in scripts/, references/, assets/ loaded on demand

Tell the agent WHEN to load each file: "Read `references/api-errors.md` if the API returns a non-200 status code" is better than "see references/ for details."

## Best Practices

### 1. Start from real expertise, not LLM general knowledge

Skills grounded in real execution always beat generic ones. Sources:
- Steps that worked in a real task
- Corrections you made to the agent's approach
- Input/output formats from real data
- Project-specific facts the agent didn't know

### 2. Add what the agent LACKS, omit what it KNOWS

Focus on: project-specific conventions, domain-specific procedures, non-obvious edge cases, particular tools/APIs.
Don't explain: what a PDF is, how HTTP works, what a database migration does.

Test: "Would the agent get this wrong without this instruction?" If no → cut it.

### 3. Design coherent units (scope)

Like a function: one coherent unit of work that composes well with other skills.
- Too narrow → multiple skills load for one task, overhead + conflicts
- Too broad → hard to activate precisely

### 4. Aim for moderate detail

Concise, stepwise guidance + working example > exhaustive documentation.
Overly comprehensive skills hurt: agent struggles to extract what's relevant.

### 5. Provide defaults, not menus

Pick ONE default approach. Mention alternatives briefly.
```
<!-- Bad: too many equal options -->
You can use pypdf, pdfplumber, PyMuPDF, or pdf2image...

<!-- Good: clear default with escape hatch -->
Use pdfplumber for text extraction.
For scanned PDFs requiring OCR, use pdf2image with pytesseract instead.
```

### 6. Favor procedures over declarations

Teach HOW to approach a class of problems, not WHAT to produce for one instance.
The approach should generalize even when individual details are specific.

### 7. Match specificity to fragility

- **Give freedom** when multiple approaches are valid and task tolerates variation
- **Be prescriptive** when operations are fragile, consistency matters, or sequence is critical

## Patterns for Effective Instructions

### Gotchas sections (highest-value content)

Concrete corrections to mistakes the agent WILL make:
```markdown
## Gotchas
- The `users` table uses soft deletes. Include `WHERE deleted_at IS NULL`.
- The user ID is `user_id` in DB, `uid` in auth, `accountId` in billing.
- `/health` returns 200 even if DB is down. Use `/ready` for full health.
```

When agent makes a mistake → add correction to gotchas. Most direct way to improve.

### Input/output formats

Define explicitly:
- What the skill receives (commands, arguments, files)
- What the skill produces (files, side effects, reports)
- Show concrete example of the flow:
```
Input:  "review devices"
Reads:  docs/specs/devices.md, docs/discovery/devices-*.md
Output: docs/specs/devices-architect-review.md
Chat:   Structured review with Critical/Important/Minor sections
```

### Templates for output format

Provide a template rather than describing format in prose. Agents pattern-match well:
```markdown
## Report structure
# [Analysis Title]
## Executive summary
[One-paragraph overview]
## Key findings
- Finding 1 with supporting data
## Recommendations
1. Specific actionable recommendation
```

### Checklists for multi-step workflows

Explicit checklist helps track progress and avoid skipping steps:
```markdown
- [ ] Step 1: Analyze (run `scripts/analyze.py`)
- [ ] Step 2: Create mapping (edit `config.json`)
- [ ] Step 3: Validate (run `scripts/validate.py`)
- [ ] Step 4: Execute (run `scripts/execute.py`)
```

### Validation loops

Do work → run validator → fix issues → repeat until pass:
```markdown
1. Make edits
2. Run validation: `python scripts/validate.py output/`
3. If validation fails: fix issues, run again
4. Only proceed when validation passes
```

### Plan-validate-execute (for destructive operations)

Create plan → validate against source of truth → execute only if valid.

### Bundling reusable scripts

If agent reinvents the same logic each run → write a tested script in `scripts/`.

## Refining with Real Execution

1. Run skill against real tasks
2. Feed ALL results back (not just failures)
3. Ask: what triggered false positives? What was missed? What could be cut?
4. Read execution traces, not just final outputs
5. Even one pass of execute-then-revise noticeably improves quality

## Common Mistakes

1. Generating skills without domain context → vague generic instructions
2. Over-comprehensive skills → agent can't extract what's relevant
3. Presenting options as equal → agent wastes time choosing
4. Instructions that don't apply to current task → agent follows them anyway
5. Deep reference chains → hard to navigate
6. Missing input/output definitions → agent guesses formats
7. No gotchas section → agent repeats known mistakes
8. No validation loop → agent doesn't check its own work
