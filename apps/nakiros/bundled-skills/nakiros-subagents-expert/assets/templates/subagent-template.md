---
name: {lowercase-name-with-hyphens}
description: >
  Use proactively for {primary use case}.
  For {task category} tasks. When asked to {specific trigger}, delegate here.
model: sonnet
# tools:
#   - Read
#   - Bash
#   - Glob
#   - Grep
#   - Write
#   - Edit
# Uncomment and trim to what this subagent actually needs.
# Omit the tools: block only if this subagent genuinely requires all tools.
#
# disallowedTools:
#   - WebSearch
# Alternative: use disallowedTools to remove specific tools from the inherited set.
#
# permissionMode: default
# Only change if you have a specific reason:
#   acceptEdits — auto-accepts file edits
#   auto — approves most tool use
#   bypassPermissions — DANGEROUS, removes all safety rails (requires justification below)
#
# maxTurns: 20
# memory: project
# color: blue
---

# {Subagent title — describes its domain in 3-5 words}

{One sentence describing what this subagent does and what domain it owns.
 This appears in the CLAUDE.md routing table.}

## Scope

- **In scope**: {list what this subagent handles}
- **Out of scope**: {list what it must NOT handle — delegate back to main agent or sister subagents}

## Procedure

Always follow this sequence when given a task:

1. {First step — e.g. "Read the relevant files"}
2. {Second step}
3. {Third step — e.g. "Write output to {path}"}

## Constraints

- **Always** {constraint 1 with concrete reference}
- **Never** {constraint 2 with concrete reference}
- **Use** {specific tool or pattern} for {specific case}

## Example

When asked to {concrete example trigger}:

```{lang}
// Concrete example of correct usage or output format
```

<!--
DELETE THIS COMMENT BLOCK BEFORE DELIVERING.

Checklist before finalising:
- [ ] name: lowercase, hyphens only, starts with a letter
- [ ] description: contains delegation keywords (use/for/when/proactively)
- [ ] model: explicit choice (sonnet/opus/haiku/inherit)
- [ ] tools: scoped to what is actually needed
- [ ] permissionMode: only changed if justified (and justification is in body)
- [ ] Body is in imperative mood (Always/Never/Use/Avoid)
- [ ] At least one code block or Example: pattern
- [ ] Under 200 lines total
- [ ] Single domain — no unrelated H2 sections
- [ ] Skills listed under skills: actually exist in the project
- [ ] Check snapshot.claudemd.content — is this subagent referenced in routing?
-->
