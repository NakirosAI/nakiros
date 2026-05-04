# Output Style Fix Report

**Target**: `{absolute path to output style .md file}`
**Date**: `{ISO timestamp}`
**Based on**: audit-report.md + frictions aggregate

## Fixes applied

| Finding | Severity | Change |
|---------|----------|--------|
| `{findingCode}` | {critical/warn/info} | {one-line description of the edit} |

## Diff

```diff
--- a/{style-name}.md
+++ b/{style-name}.md
@@ -{line},{count} +{line},{count} @@
-{removed line}
+{added line}
```

## Skipped

{List any findings that were NOT fixed, with the reason (e.g. SIZE_BUDGET_EXCEEDED,
 requires user decision, crossref that needs human verification). Empty if all fixed.}
