# Audit — {skill-name}

> Date: {YYYY-MM-DD}
> File: {path to SKILL.md audited}

## Score: {X}/23

## Frontmatter (X/4)

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1 | Name matches folder, lowercase, valid format | ✅/❌ | {detail} |
| 2 | Description: WHAT + WHEN + trigger keywords | ✅/❌ | {detail} |
| 3 | user-invocable set correctly | ✅/❌ | {detail} |
| 4 | No unnecessary fields | ✅/❌ | {detail} |

## Inputs / Outputs (X/4)

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 5 | Inputs section with commands, args, files, external data | ✅/❌ | {detail} |
| 6 | Outputs section with ALL files, side effects, chat | ✅/❌ | {detail} |
| 7 | At least one concrete input → output example flow | ✅/❌ | {detail} |
| 8 | Output file paths use clear patterns | ✅/❌ | {detail} |

## Structure (X/4)

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 9 | Under 500 lines / ~5000 tokens | ✅/❌ | {X lines, ~Y tokens} |
| 10 | Heavy reference material in references/ | ✅/❌ | {detail} |
| 11 | Context loading with ALL files + WHEN conditions | ✅/❌ | {detail} |
| 12 | Available commands at the bottom | ✅/❌ | {detail} |

## Content (X/5)

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 13 | Procedures, not declarations | ✅/❌ | {detail} |
| 14 | Adds what agent LACKS, omits what it KNOWS | ✅/❌ | {detail} |
| 15 | Defaults, not menus | ✅/❌ | {detail or quote of menu found} |
| 16 | Gotchas section with project-specific traps | ✅/❌ | {detail} |
| 17 | Every instruction specific and actionable | ✅/❌ | {quote of vague instruction if found} |

## Safety (X/3)

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 18 | No mocks rule (if touches real infra) | ✅/❌/N/A | {detail} |
| 19 | ASK when unsure rule | ✅/❌ | {detail} |
| 20 | Auth/security context referenced | ✅/❌/N/A | {detail} |

## Consistency (X/3)

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 21 | French communication rule | ✅/❌ | {detail} |
| 22 | File paths match project structure | ✅/❌ | {detail or wrong path found} |
| 23 | LLM docs referenced for frameworks | ✅/❌/N/A | {detail} |

## Priority fixes

### Critical (must fix)
- {Fix description with exact text to add/change}

### Important (should fix)
- {Fix description}

### Minor (nice to have)
- {Fix description}
