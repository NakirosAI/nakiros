# Card format — strict

Each recommendation card lives at `./recos/<kebab-title>.md` and follows this exact structure.

## YAML frontmatter

Between two `---` lines at the very top of the file. **Quote `patternId` as a YAML string** — its value may look numeric (16-char sha1 hex prefix) and YAML would otherwise misparse it as scientific notation.

```yaml
---
recId: <kebab-case-id, matches the filename without .md>
patternId: "<the EXACT pattern.id from ./pattern.json — quoted, always>"
action: fix | create
artifactType: rules | skill | claudemd | subagent | hook | permission | mcp | output-style
target: <existing-id-from-inventory> | new
title: <short human title, one line>
evidence:
  zoneRefs:
    - {convoId: <id>, zoneId: <id>}
  files:
    - <path/relative/to/repo>
---
```

Constraints:
- `action: fix` → `target` MUST be an `id` present in `./inventory.json` for the matching `type`.
- `action: create` → `target: new`.
- `artifactType` must be one of the 8 enum values exactly (lowercase, hyphen for `output-style`).
- `recId` must be kebab-case (lowercase + hyphens, no spaces or special chars). Match the filename.

## Body

After the closing `---`, the body has three sections in this exact order:

```markdown
# <title from frontmatter>

## Why
<2-3 sentences anchored in pattern evidence. Cite the topic, the files, the zone excerpts. Explain why this action would have prevented the friction.>

## Brief
<self-contained prompt for the downstream runner. Detailed — include zone excerpts (verbatim from reactionPoint.snippet), exact file paths, exact error messages. The downstream runner reads this verbatim as its first user message. Minimum 20 chars, but in practice expect 5-30 lines.>

## Acceptance criteria
- bullet 1 (specific, verifiable)
- bullet 2
- bullet 3 (optional)
```

## Common mistakes to avoid

- **Numeric patternId without quotes.** YAML reads `546337e749143029` as scientific notation. Always quote.
- **Summarising zone evidence in the Brief.** The downstream runner needs the raw zone snippets to act correctly.
- **Inventing a target for `fix`.** Cross-check against `./inventory.json` before committing to a `fix` action.
- **Multiple actions in one card.** One card = one atomic action. If you need 3 changes, write 3 cards.
- **Wrong `artifactType` casing.** Use `output-style` (hyphen, lowercase), `claudemd` (no dot, lowercase), `subagent` (singular).
