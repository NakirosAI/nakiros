---
recId: <kebab-case-id, must match the filename without .md>
patternId: "<pattern.id from ./pattern.json — KEEP THE QUOTES, the value may look numeric>"
action: <fix | create>
artifactType: <rules | skill | claudemd | subagent | hook | permission | mcp | output-style>
target: <existing-id-from-inventory.json if action=fix, else: new>
title: <one-line human title>
evidence:
  zoneRefs:
    - {convoId: <id>, zoneId: <id>}
  files:
    - <path/relative/to/repo>
---

# <same title as frontmatter>

## Why
<2-3 sentences anchored in pattern evidence. Cite the topic, the files, the zone excerpts. Explain why this action would have prevented the friction. If you chose `create` because no clean inventory match existed, mention the closest alternative you considered.>

## Brief
<Self-contained prompt passed VERBATIM to the downstream runner. Detailed — include zone excerpts copied word-for-word from reactionPoint.snippet, exact file paths, exact error messages. Do NOT summarise. Min 20 chars; in practice 5-30 lines.>

## Acceptance criteria
- <specific, verifiable bullet>
- <specific, verifiable bullet>
- <optional third bullet>
