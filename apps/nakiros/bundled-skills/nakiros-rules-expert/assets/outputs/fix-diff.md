# Rule Fix Diff

**Target**: `{absolute path to rule .md file}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/15`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Add YAML frontmatter block"}
- **Source**: `{audit:check-id OR friction:type x N occurrences}`
- **Section**: `{section name in rule file, or "frontmatter"}`
- **Diff**:
```diff
+ ---
+ paths:
+   - "src/**/*.ts"
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
- Budget: `≤ 150`

## Suggested next step

Run `audit` to confirm score improved, or split into multiple focused rules if
`content.single_topic` was failing.
