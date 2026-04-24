# Machine-readable output tail

After the Markdown report, append a **single fenced code block** that the
nakiros proposal engine consumes. The Markdown report stays the primary,
human-facing artefact; the JSON tail is a structured dump of the *same*
frictions you already described, so the engine can cluster them and
propose new or patched skills.

## Emit this at the very end of the report

Include a final H2 section and a single fenced block with the language
`nakiros-json`. Nothing else may follow the closing fence.

````markdown
## Nakiros machine output

```nakiros-json
{
  "schemaVersion": 1,
  "frictions": [
    {
      "approximateTurn": 42,
      "timestampIso": "2026-04-22T10:30:12Z",
      "description": "Short natural-language summary of the friction (20-60 words). This string is embedded for clustering, so describe the shape of the problem, not the specific file name.",
      "category": "context-drift",
      "rawExcerpt": "Verbatim ~500 chars around the friction (user turn + assistant turn), for UI traceability."
    }
  ]
}
```
````

## Field spec

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | Always `1` for now. Bump if shape changes. |
| `frictions[]` | yes | May be empty `[]` if the conversation was clean. |
| `approximateTurn` | yes | Best-effort turn index (1-based) where the friction surfaced. |
| `timestampIso` | yes | Timestamp of that turn (ISO 8601). Copy from the `--- turn N (...) @ <timestamp> ---` header. |
| `description` | yes | 20-60 words. This is the **embedding input** — describe the *shape* of the friction (e.g. "model kept editing test file after user explicitly said to edit implementation") so two similar frictions across conversations cluster together. Avoid project-specific proper nouns unless they are part of the pattern. |
| `category` | optional | One of the tags below. Omit if none fits — the engine will treat missing as `other`. |
| `rawExcerpt` | yes | ~500 chars, verbatim, around the friction. Preserve user language. Used only for UI display, not clustering. |

## Category taxonomy

Pick at most one. Prefer the tag that best explains *why* the friction
happened, not *what* the user said.

| Category | When to use |
|---|---|
| `context-drift` | Model lost information mentioned earlier in the conversation. |
| `tool-loop` | Same tool failing repeatedly, or retry without diagnosing. |
| `wrong-file` | Edits applied to the wrong file, wrong function, or wrong location. |
| `scope-creep` | Model did more than asked, introduced unrequested changes. |
| `unmet-instruction` | Explicit user directive ignored (e.g. "don't touch the DB"). |
| `repeated-correction` | User had to correct the same mistake more than once. |
| `missing-knowledge` | Model lacked domain/project-specific knowledge a skill could provide. |
| `other` | None of the above cleanly fits. |

## What to include in `frictions[]`

- Every friction instance cited in `## Friction & frustration`.
- Every context drift instance cited in `## Context drift`.
- Every root cause that is tied to a concrete moment in the session
  (if the root cause spans multiple turns, pick the pivotal turn).

What to **exclude**:

- Stage-1 keyword matches already surfaced — the engine already knows
  about those. Only emit the ones your *narrative* analysis confirmed as
  real friction.
- Tool failures that were purely environmental (flaky network, missing
  permission) with no skill remediation — those are not candidates for a
  skill proposal.

## Hard rules

- The JSON block must be **valid JSON**. No comments, no trailing commas.
- The fence language **must be** `nakiros-json` (not `json`). The engine
  greps for this exact fence to locate the block.
- The block must be the **last** thing in the report — no trailing text,
  no "hope this helps", nothing.
- If the conversation had no real frictions, still emit the block with
  `"frictions": []`. Do not omit it.
- Quote `rawExcerpt` values exactly as written. Escape newlines as `\n`
  inside the JSON string.
