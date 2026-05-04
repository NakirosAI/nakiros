# CLAUDE.md Audit Report

**Target**: `{absolute path to CLAUDE.md}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/18` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Size & Structure | {n} | {n} | {n} |
| Content categories | {n} | {n} | {n} |
| Tone & specificity | {n} | {n} | {n} |
| Anti-patterns | {n} | {n} | {n} |
| Paths & references | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `structure.line_count` | Line count under 200 | ✅ / ❌ / N/A | {one short sentence} |
| `structure.heading_hierarchy` | Heading hierarchy correct | ✅ / ❌ / N/A | {detail} |
| `structure.bullet_depth` | No nested bullets > 2 deep | ✅ / ❌ / N/A | {detail} |
| `structure.section_size` | No section > 50 lines | ✅ / ❌ / N/A | {detail} |
| `content.architecture_pointers` | Architecture pointers present | ✅ / ❌ / N/A | {detail} |
| `content.mandatory_constraints` | Mandatory constraints present | ✅ / ❌ / N/A | {detail} |
| `content.quick_pointers` | Gotchas / quick pointers present | ✅ / ❌ / N/A | {detail} |
| `content.validation_commands` | Validation commands present | ✅ / ❌ / N/A | {detail} |
| `content.runtime_stack` | Runtime/stack identified | ✅ / ❌ / N/A | {detail} |
| `tone.imperative_mood` | Imperative mood, no hedges | ✅ / ❌ / N/A | {detail} |
| `tone.no_fluff` | No marketing/fluff tokens | ✅ / ❌ / N/A | {detail} |
| `tone.no_verbose_why` | No verbose WHY paragraphs | ✅ / ❌ / N/A | {detail} |
| `tone.actionable_instructions` | Every rule is actionable | ✅ / ❌ / N/A | {detail} |
| `antipattern.vague_advice` | No vague advice | ✅ / ❌ / N/A | {detail} |
| `antipattern.code_obvious` | No code-obvious restatements | ✅ / ❌ / N/A | {detail} |
| `antipattern.long_lists` | No flat list > 7 items | ✅ / ❌ / N/A | {detail} |
| `paths.unambiguous` | Paths unambiguous | ✅ / ❌ / N/A | {detail} |
| `paths.external_docs_linked` | External docs linked, not duplicated | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {Only items where the file is unusable as-is. Empty if no critical fail.}

### Important
- {Items that materially degrade agent reliability.}

### Minor
- {Polish, stylistic preferences. Often empty.}

## Notes

{Optional one-paragraph commentary if the file has a structural issue not captured by individual checks. Skip otherwise.}
