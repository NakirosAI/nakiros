# Subagent Fix Diff

**Target**: `{absolute path to subagent .md file}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/15`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Add YAML frontmatter block"}
- **Source**: `{audit:check-id OR friction:type x N occurrences}`
- **Section**: `{section name in subagent file, or "frontmatter"}`
- **Diff**:
```diff
+ ---
+ name: my-subagent
+ description: Use proactively for X tasks. When asked to Y, delegate here.
+ model: sonnet
+ tools:
+   - Read
+   - Bash
+ ---
```

### 2. {next edit}
- **Source**: ...
- **Section**: ...
- **Diff**: ...

## Edits skipped

- `{friction type, N occurrences}` — reason: `{e.g. "size budget exceeded", "ambiguous, asked user"}`

## Resulting size

- Before: `{N} lines`
- After: `{M} lines`
- Budget: `≤ 200`

## Suggested next step

Run `audit` to confirm score improved, or split into multiple focused subagents
if `content.single_domain` was failing. If `crossref.referenced_in_claudemd`
failed, add this subagent to the CLAUDE.md routing table.
