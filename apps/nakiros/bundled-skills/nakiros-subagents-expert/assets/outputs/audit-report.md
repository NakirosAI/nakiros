# Subagent Audit Report

**Target**: `{absolute path to subagent .md file}`
**Date**: `{ISO timestamp}`
**Score**: `{X}/15` (`{N_pass}` ✅ / `{N_fail}` ❌ / `{N_na}` N/A)

## Section breakdown

| Section | Pass | Fail | N/A |
|---------|------|------|-----|
| Frontmatter | {n} | {n} | {n} |
| Structure | {n} | {n} | {n} |
| Configuration | {n} | {n} | {n} |
| Content | {n} | {n} | {n} |
| Cross-entity | {n} | {n} | {n} |

## Detailed results

| ID | Check | Result | Detail |
|----|-------|--------|--------|
| `frontmatter.present` | Valid YAML frontmatter present | ✅ / ❌ / N/A | {one short sentence} |
| `frontmatter.name_format` | name: lowercase and hyphens only | ✅ / ❌ / N/A | {detail} |
| `frontmatter.description_present` | description: field present and non-empty | ✅ / ❌ / N/A | {detail} |
| `frontmatter.description_actionable` | description: contains delegation keywords | ✅ / ❌ / N/A | {detail} |
| `structure.line_count` | File ≤ 200 lines | ✅ / ❌ / N/A | {detail} |
| `structure.body_present` | Body present after frontmatter (>= 5 lines) | ✅ / ❌ / N/A | {detail} |
| `structure.heading_hierarchy` | No skipped heading levels, max H3 | ✅ / ❌ / N/A | {detail} |
| `config.model_specified` | model: field present | ✅ / ❌ / N/A | {detail} |
| `config.tools_scoped` | tools: or disallowedTools: present | ✅ / ❌ / N/A | {detail} |
| `config.no_unjustified_bypass` | No bypassPermissions without justification | ✅ / ❌ / N/A | {detail} |
| `content.single_domain` | Body describes one focused domain | ✅ / ❌ / N/A | {detail} |
| `content.imperative_mood` | Body uses imperative verbs | ✅ / ❌ / N/A | {detail} |
| `content.has_examples` | At least one code block or Example: pattern | ✅ / ❌ / N/A | {detail} |
| `crossref.referenced_in_claudemd` | Subagent referenced in CLAUDE.md routing | ✅ / ❌ / N/A | {detail} |
| `crossref.skills_exist` | All skills: entries exist in snapshot | ✅ / ❌ / N/A | {detail} |

## Priority fixes

### Critical
- {Only items where the subagent is broken: missing frontmatter, empty body,
  bypassPermissions without justification. Empty if no critical fail.}

### Important
- {Items that degrade agent quality: invalid name format, vague description,
  missing examples, multi-domain scope, stale skill refs.}

### Minor
- {Polish: no model specified, tools not scoped, not in CLAUDE.md routing.}

## Notes

{Optional commentary on cross-entity observations from dot-claude-snapshot.json:
 - Is the subagent referenced in CLAUDE.md routing table?
 - Are all skills: entries valid?
 - Are all mcpServers: entries valid?
 - Does the body contradict CLAUDE.md constraints?
 Skip if none.}
