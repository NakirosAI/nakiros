# Friction → CLAUDE.md Edit Mapping

> Use this table on `fix` to translate Nakiros friction types (from `.nakiros/frictions/aggregate.json`) into precise CLAUDE.md edits.

## Schema reminder

The friction classifier (V1.1) emits per-conversation friction entries. The aggregator rolls them up by `type` across all conversations of a project:

```json
{
  "projectPath": "/abs/path",
  "totalConversations": 42,
  "frictionsByType": {
    "<friction_type>": [
      {
        "summary": "human-readable summary of the friction",
        "occurrences": 5,
        "examples": ["sessionId-1", "sessionId-2"],
        "candidateRule": "optional one-line rule the classifier suggested"
      }
    ]
  }
}
```

Apply edits ONLY for frictions with `occurrences ≥ 3` (signal threshold). One-off frictions are noise.

## Friction type → CLAUDE.md target section

| Friction type | Where to edit in CLAUDE.md | Edit pattern |
|--------------|----------------------------|--------------|
| `missing_context` | Architecture pointers | Add a one-liner naming the missing concept + link to authoritative file |
| `wrong_path` | Mandatory constraints | Add imperative rule: `Use 'X' from {path}, never from {wrong path}` |
| `tool_misuse` | Mandatory constraints OR Validation commands | Add a constraint forbidding the misuse, OR add the correct command |
| `naming_drift` | Mandatory constraints | Add convention rule: `Use {correct name} consistently. Never {wrong variant}.` |
| `permission_loop` | Quick pointers / gotchas | Add gotcha explaining the permission boundary |
| `redundant_search` | Quick pointers / gotchas | Add a "where things live" pointer to the file the agent kept searching for |
| `convention_violation` | Mandatory constraints | Restate the convention with imperative + concrete file pattern |
| `framework_misuse` | Mandatory constraints OR linked reference | If short → mandatory rule; if long → write a `.claude/rules/{topic}.md` and link from CLAUDE.md |
| `stale_doc` | Mandatory constraints | Add: `Source of truth for {topic} is {path}. Other docs may be stale.` |
| `compilation_error_repeat` | Validation commands | Add the typecheck command before commit |
| `test_skipped` | Validation commands | Add the test command before commit |

If a friction type is not in this table, classify it as one of the above by analogy. Do not invent new sections in CLAUDE.md.

## Edit budget rule

- Pick at most **5 edits per `fix` run**, ranked by `occurrences * severity`.
- If applying every mapped edit would push CLAUDE.md over 200 lines, stop, write a `fix-findings.jsonl` entry with code `SIZE_BUDGET_EXCEEDED`, and ask the user which frictions to prioritize.
- A single CLAUDE.md edit should be ≤ 3 lines. Longer rationale → put it in a `.claude/rules/` file and link it.

## Worked examples

### Example 1 — `wrong_path` friction
**Input** (aggregate excerpt):
```json
{
  "type": "wrong_path",
  "summary": "Agent kept importing from '@/utils/i18n' instead of 'react-i18next'",
  "occurrences": 7,
  "candidateRule": "Always import t() from react-i18next, never from custom utils"
}
```

**CLAUDE.md edit** (insert under "Mandatory constraints"):
```markdown
- i18n: import `useTranslation` / `t` from `react-i18next`. Never from
  `@/utils/i18n` (this file does not export it).
```

### Example 2 — `missing_context` friction
**Input**:
```json
{
  "type": "missing_context",
  "summary": "Agent did not know IPC_CHANNELS lived in @nakiros/shared",
  "occurrences": 5
}
```

**CLAUDE.md edit** (insert under "Architecture pointers"):
```markdown
- IPC channel constants live in `packages/shared/src/ipc-channels.ts`,
  re-exported as `IPC_CHANNELS` from `@nakiros/shared`. Never inline
  channel name strings.
```

### Example 3 — `compilation_error_repeat`
**Input**:
```json
{
  "type": "compilation_error_repeat",
  "summary": "Agent committed multiple times without running tsc, hit type errors in CI",
  "occurrences": 4
}
```

**CLAUDE.md edit** (insert under "Validation before closing"):
```markdown
pnpm -F nakiros exec tsc --noEmit
```
(if not already present)

## What NOT to do

- Do NOT add a fix that simply restates the friction summary verbatim — translate it into an actionable rule with concrete paths.
- Do NOT bundle multiple unrelated frictions into one bullet — each rule should map to one friction class.
- Do NOT remove existing rules to make room. Always ask the user before deleting content (only de-duplicate near-identical lines without asking).
