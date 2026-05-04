# Permissions Fix Diff

**Target**: `{absolute path to settings.json}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/14`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Add .env protection to deny list"}
- **Source**: `{audit:security.env_files_denied OR friction:type x N occurrences}`
- **Path**: `permissions.deny`
- **Diff**:
```diff
  "deny": [
    "Bash(rm -rf *)",
+   "Read(./.env*)",
+   "Edit(./.env*)"
  ]
```

### 2. {next edit — e.g. "Change defaultMode from bypassPermissions to default"}
- **Source**: `{audit:security.default_mode_not_bypass}`
- **Path**: `permissions.defaultMode`
- **Diff**:
```diff
- "defaultMode": "bypassPermissions",
+ "defaultMode": "default",
```

### 3. {e.g. "Remove stale Agent(retired-bot) from deny"}
- **Source**: `{audit:crossref.no_useless_deny_for_undefined_tools}`
- **Path**: `permissions.deny`
- **Diff**:
```diff
  "deny": [
    "Bash(rm -rf *)",
-   "Agent(retired-bot)",
    "Read(./.env*)"
  ]
```

## Edits skipped

- `{friction type, N occurrences}` — reason: `{e.g. "ambiguous intent — requires user confirmation"}`

## Resulting permissions block

{Paste the complete resulting permissions block here so the user can review and apply it.}

## Suggested next step

Run `audit` to confirm score improved. If `crossref.agent_rules_match_subagents` is
still failing, verify the subagent name in `dot-claude-snapshot.json`.
