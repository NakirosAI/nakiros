# Output Style Audit Report

**Target**: `{absolute path to output style .md file}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/12` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Frontmatter | {n} | {n} | {n} |
| Structure | {n} | {n} | {n} |
| Content | {n} | {n} | {n} |
| Cross-entity | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `frontmatter.present` | Valid YAML frontmatter present | ✅ / ❌ / N/A | {one short sentence} |
| `frontmatter.name_or_filename` | name: field or valid filename | ✅ / ❌ / N/A | {detail} |
| `frontmatter.description_present` | description: field present and non-empty | ✅ / ❌ / N/A | {detail} |
| `structure.line_count` | File ≤ 200 lines | ✅ / ❌ / N/A | {detail} |
| `structure.body_present` | Body present (≥ 5 lines) | ✅ / ❌ / N/A | {detail} |
| `structure.heading_hierarchy` | No skipped heading levels, max H3 | ✅ / ❌ / N/A | {detail} |
| `content.role_defined` | Style defines a clear role or persona | ✅ / ❌ / N/A | {detail} |
| `content.tone_specified` | Tone, formality, or verbosity specified | ✅ / ❌ / N/A | {detail} |
| `content.format_specified` | Expected output format specified | ✅ / ❌ / N/A | {detail} |
| `content.imperative_mood` | Imperative mood, few hedges | ✅ / ❌ / N/A | {detail} |
| `crossref.no_conflict_with_claudemd` | No frontal contradiction with CLAUDE.md | ✅ / ❌ / N/A | {detail} |
| `crossref.unique_role` | No major role overlap with other styles | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {Items that break the style: no frontmatter block, empty body. Empty if no critical fail.}

### Important
- {Items that degrade style reliability: missing role persona, no tone guidance, excessive hedges, CLAUDE.md conflict.}

### Minor
- {Polish: missing description, format not specified, possible role overlap with another style.}

## Notes

{Optional commentary on behavioral gaps not captured by individual checks, or
 cross-entity observations from dot-claude-snapshot.json. Skip if none.}
