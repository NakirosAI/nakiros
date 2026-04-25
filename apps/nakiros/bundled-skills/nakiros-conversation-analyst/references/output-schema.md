# Output schema — what each section must contain

The report is Markdown. Sections are fixed in order. Each has a specific expected content.

## `## What happened`

2-4 sentences. A neutral narrative of the session:
- What the user set out to do
- How long it ran (use stage-1 duration)
- How it ended (completed / abandoned / handed off)

Do **not** editorialize here. This section is for orientation only.

## `## Friction & frustration`

For each friction instance:

```markdown
- **~turn {N}** — {short description}
  > {verbatim quote, max 120 chars}
  Signal: {explicit negation | implicit tone | behavioural pattern | escalation}
```

Ordering: chronological.

If there is a death spiral (see friction-patterns.md), call it out at the end of this section with a short paragraph naming the loop.

## `## Context drift`

For each drift instance:

```markdown
- **~turn {N}** (~{X} turns after original mention, ~{K}k tokens of context)
  Original: "{quote of the earlier information}"
  Drift: "{quote of the forgetful response}"
  Impact: {high | medium | low}
```

If no drift found, write `No context drift detected.` and move on. Don't invent one.

## `## Tool issues`

For each tool that failed ≥ 2 times:

```markdown
- **{ToolName}**: {N} failures
  Pattern: {what kept going wrong}
  Likely cause: {permissions | env | bad input | missing file | flaky network}
```

If no tool issues, omit the section entirely.

## `## Root causes`

2-5 items, ordered by impact. Each follows this shape:

```markdown
### {Short title}
{1-2 sentence explanation}

**Evidence**: {specific references — turn N, tool X, quote "..."}
```

Ordering rule: the root cause that best explains the most friction/drift goes first.

## `## What would have helped`

Bulleted list of concrete recommendations. Each bullet must:
- Start with a verb ("Use", "Split", "Restate", "Create")
- Be specific to this conversation
- Tie back to a finding above

Example:

```markdown
- **Use `/clear` after reaching 150k tokens** — at turn ~{N} the context hit 180k and the assistant forgot the rule from turn 4 about not touching the DB. A fresh session would have preserved that rule.
```

Avoid generic advice ("be mindful of context", "write cleaner prompts"). If you can't name the specific moment it would have helped, skip the recommendation.

## `## Skill recommendations` (optional)

Only include if the conversation shows a pattern that would generalize. Format:

```markdown
### Skill: `{proposed-name}`
**Trigger**: {when it should activate}
**What it would enforce**: {2-3 bullets of concrete guardrails}
**Evidence in this conversation**: {turn refs where it would have helped}
```

If no pattern generalizes, omit the section.

## `## Nakiros machine output` (required — always last)

A single `nakiros-json` fenced block. Full schema and rules in `machine-output.md`. Must be emitted even when there are no frictions (`"frictions": []`), and nothing may follow its closing fence.

## Things this report must NEVER contain

- A "Conclusion" section
- Vague advice with no specific anchor
- Counts that don't match stage-1 numbers
- Invented quotes (if you're not quoting verbatim, say "paraphrased")
- Scolding language aimed at the user
- Speculation about the user's state of mind beyond what text evidences
- References to this skill or the analyzer itself
