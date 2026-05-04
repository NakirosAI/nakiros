# Hooks Fix Diff

**Target**: `{absolute path to settings.json}`
**Source signals**:
- Audit: `{outputs/audit-report.md path}` — `{score}/14`
- Frictions: `{path}/.nakiros/frictions/aggregate.json` — `{N high-recurrence frictions}` considered

## Edits applied

### 1. {imperative title — e.g. "Add timeout to PostToolUse command handler"}
- **Source**: `{audit:handler.timeout_explicit OR friction:type x N occurrences}`
- **Hook path**: `hooks.PostToolUse[0].hooks[0]`
- **Diff**:
```diff
  {
    "type": "command",
    "command": "node scripts/post-tool-logger.mjs",
+   "timeout": 30
  }
```

### 2. {next edit — e.g. "Remove matcher from Stop event (silently ignored)"}
- **Source**: `{audit:structure.matcher_compatible_with_event}`
- **Hook path**: `hooks.Stop[0]`
- **Diff**:
```diff
  {
-   "matcher": "build-done",
    "hooks": [...]
  }
```

### 3. {e.g. "Replace HTTP URL with HTTPS in SessionEnd handler"}
- **Source**: `{audit:bp.no_unjustified_dangerous}`
- **Hook path**: `hooks.SessionEnd[0].hooks[0]`
- **Diff**:
```diff
  {
    "type": "http",
-   "url": "http://internal-tracker.local/session-ended",
+   "url": "https://internal-tracker.local/session-ended",
    "timeout": 10
  }
```

## Edits skipped

- `{friction type, N occurrences}` — reason: `{e.g. "ambiguous intent — requires user confirmation"}`

## Resulting settings.json

{Paste the complete resulting hooks block here so the user can review and apply it.}

## Suggested next step

Run `audit` to confirm score improved. If `crossref.command_path_exists` is
still failing, create the missing script files at the referenced paths.
