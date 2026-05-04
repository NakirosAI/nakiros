---
paths:
  - "{glob pattern — e.g. src/**/*.ts}"
---

# Rule — {Topic name}

{Optional: one sentence of context explaining why this rule exists. Keep it
 short — if the why is complex, link to a doc instead.}

## {Section name — e.g. "How", "Rules", "Constraints"}

```{lang}
// Concrete example of correct usage
```

- **Always** {imperative rule 1 with concrete file/symbol/command reference}
- **Never** {imperative rule 2 with concrete reference}
- {Additional bullet if needed — imperative verb first}

<!--
DELETE THIS COMMENT BLOCK BEFORE DELIVERING.

Checklist before finalising:
- [ ] paths: field present with at least one glob
- [ ] H1 title clearly names the single topic
- [ ] All bullets start with imperative verbs (always/never/use/avoid/add)
- [ ] At least one code example (fenced block)
- [ ] Under 150 lines total
- [ ] No section exceeds 40 lines
- [ ] No "consider / ideally / be careful / make sure" without concrete clause
- [ ] No marketing words (awesome / robust / world-class)
- [ ] Verify globs match real files in the repo (run: find . -path '<glob>' | head)
-->
