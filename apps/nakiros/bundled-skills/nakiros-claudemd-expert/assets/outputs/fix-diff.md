# CLAUDE.md Fix Diff

**Target**: `{absolute path to CLAUDE.md}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/18`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Add IPC pointer"}
- **Source**: `{audit:check-id OR friction:type x N occurrences}`
- **Section**: `{section name in CLAUDE.md}`
- **Diff**:
```diff
+ - IPC channel constants live in `packages/shared/src/ipc-channels.ts`,
+   re-exported as `IPC_CHANNELS` from `@nakiros/shared`.
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

Run `audit` to confirm score improved, or run evals if the fix is non-trivial.
