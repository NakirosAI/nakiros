# Output schema

The classifier emits **one JSON object** with the shape below. Field keys are always in English. Values in natural-language fields match the conversation language (FR if user wrote in FR, EN otherwise).

```json
{
  "session_summary": "string (1-2 sentences, conversation language)",
  "language": "fr | en",
  "phases": [
    {
      "id": "string (e.g. 'p1', 'p2', stable within this output)",
      "label": "string (free-form, e.g. 'setup', 'implementation', 'debugging')",
      "from_turn": 1,
      "to_turn": 5,
      "summary": "string (one sentence, ≤ 25 words, conversation language)"
    }
  ],
  "frictions": [
    {
      "phase_id": "string (must reference one of phases[].id)",
      "kind": "miscomprehension | rework | user_takeover | convention_violation | scope_drift | missing_documented_context | wrong_abstraction_level",
      "severity": "low | med | high",
      "evidence_turns": [14, 15, 16],
      "what_happened": "string (1-2 sentences, conversation language, factual)",
      "rule_candidate": "string | null (the rule this friction would benefit from, or null if not generalizable)",
      "scope": "project | global | none",
      "confidence": 0.0
    }
  ],
  "extracted_rules": [
    {
      "rule": "string (prescriptive, ≤ 20 words, conversation language)",
      "why": "string (one sentence referencing concrete behavior, conversation language)",
      "phase_id": "string (most representative phase id)",
      "target_module": "rules | claude_md | subagent | skill | output_style",
      "scope": "project | global",
      "confidence": 0.0
    }
  ]
}
```

## Field constraints

### Top level
- `session_summary` — required, 1-2 sentences, max ~50 words.
- `language` — required, `"fr"` or `"en"` (the dominant language of user turns).
- `phases` — required, **at least 1 entry**, typically 2-6.
- `frictions` — required, **may be empty `[]`** if the session was clean.
- `extracted_rules` — required, **may be empty `[]`**.

### `phases[]`
- `id` — short string, must be unique within the array. Convention: `p1`, `p2`, … in chronological order.
- `label` — free-form snake_case label.
- `from_turn`, `to_turn` — 1-indexed turn numbers from the digest. `from_turn` ≤ `to_turn`. Phases must not overlap. Phases together should cover the whole session (no gaps).
- `summary` — one sentence describing what was attempted (not its quality).

### `frictions[]`
- `phase_id` — must reference an existing `phases[].id`.
- `kind` — one of the 7 enum values.
- `severity` — `low`, `med`, or `high` (see SKILL.md for criteria).
- `evidence_turns` — at least one turn number from the digest, ascending.
- `what_happened` — factual narrative, no editorializing.
- `rule_candidate` — `null` if the friction is too situational to generalize.
- `scope` — `project` if specific to this codebase, `global` if any project, `none` if `rule_candidate` is null.
- `confidence` — float in `[0, 1]`. Do not emit frictions with confidence < 0.5.

### `extracted_rules[]`
- `rule` — short prescriptive sentence. "Do X" or "Always Y" or "Never Z".
- `why` — references the concrete behavior in this session.
- `phase_id` — the most representative phase where the rule would have helped.
- `target_module` — best-guess routing for the V1.3 propose-engine.
- `scope` — `project` or `global`.
- `confidence` — float in `[0, 1]`. Below 0.5, do not emit.

## Hard constraints

- The output **must** be a single JSON object parseable by `JSON.parse`.
- No leading text, no trailing text, no Markdown code fences (```json … ```).
- All keys in the schema are required, but arrays may be empty.
- All numeric fields are numbers, not strings.
- All boolean enum-like fields use the exact strings listed above (no synonyms, no caps).

## Examples of valid empty cases

A clean conversation:
```json
{
  "session_summary": "User asked for a typo fix in the README. The agent fixed it on first try.",
  "language": "en",
  "phases": [
    { "id": "p1", "label": "implementation", "from_turn": 1, "to_turn": 3, "summary": "Located the typo and applied the fix." }
  ],
  "frictions": [],
  "extracted_rules": []
}
```

A session with frictions but no extractable rule:
```json
{
  "session_summary": "User wanted a one-off script. The agent rewrote it twice on the user's stylistic feedback.",
  "language": "en",
  "phases": [
    { "id": "p1", "label": "implementation", "from_turn": 1, "to_turn": 4, "summary": "First draft of the script." },
    { "id": "p2", "label": "refinement", "from_turn": 5, "to_turn": 9, "summary": "Two stylistic rewrites on user feedback." }
  ],
  "frictions": [
    {
      "phase_id": "p2",
      "kind": "rework",
      "severity": "low",
      "evidence_turns": [5, 7],
      "what_happened": "Agent rewrote the script after each user comment instead of asking what style was preferred.",
      "rule_candidate": null,
      "scope": "none",
      "confidence": 0.6
    }
  ],
  "extracted_rules": []
}
```
