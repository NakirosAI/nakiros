# Rule Audit Report

**Target**: `{absolute path to rule .md file}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/15` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Frontmatter | {n} | {n} | {n} |
| Structure | {n} | {n} | {n} |
| Tone | {n} | {n} | {n} |
| Content | {n} | {n} | {n} |
| Cross-entity | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `frontmatter.present` | Valid YAML frontmatter present | ✅ / ❌ / N/A | {one short sentence} |
| `frontmatter.paths_field` | paths: field with array of globs | ✅ / ❌ / N/A | {detail} |
| `frontmatter.description_present` | Description or H1 summarises topic | ✅ / ❌ / N/A | {detail} |
| `frontmatter.no_unknown_keys` | No unknown frontmatter keys | ✅ / ❌ / N/A | {detail} |
| `structure.line_count` | File ≤ 150 lines | ✅ / ❌ / N/A | {detail} |
| `structure.heading_hierarchy` | H1 unique title, no skipped levels | ✅ / ❌ / N/A | {detail} |
| `structure.section_size` | No section > 40 lines | ✅ / ❌ / N/A | {detail} |
| `tone.imperative_mood` | Imperative mood | ✅ / ❌ / N/A | {detail} |
| `tone.no_fluff` | No marketing/fluff tokens | ✅ / ❌ / N/A | {detail} |
| `tone.actionable` | Each bullet actionable | ✅ / ❌ / N/A | {detail} |
| `content.single_topic` | Covers one focused topic | ✅ / ❌ / N/A | {detail} |
| `content.has_examples` | At least one code example | ✅ / ❌ / N/A | {detail} |
| `content.no_obvious_restatement` | No obvious restatements | ✅ / ❌ / N/A | {detail} |
| `crossref.paths_match_files` | Each glob matches >= 1 real file | ✅ / ❌ / N/A | {detail} |
| `crossref.no_path_overlap` | No significant paths: overlap | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {Only items where the rule is broken (missing frontmatter, no paths: field). Empty if no critical fail.}

### Important
- {Items that degrade rule reliability: vague bullets, missing examples, multi-topic scope.}

### Minor
- {Polish: fluff tokens, obvious restatements, minor overlap.}

## Notes

{Optional commentary on structural issues not captured by individual checks, or
 cross-entity observations from dot-claude-snapshot.json. Skip if none.}
