---
name: nakiros-conversation-classifier
description: "Classifies a single Claude Code conversation into structured JSON — phases, semantic frictions (where human and agent did not understand each other), and candidate `.claude/` rules — for downstream cross-conversation aggregation by Nakiros. Runs on a compressed digest of the session, optimized for Haiku 4.5. Triggers: 'classify this conversation', 'extract frictions', 'classifie cette conversation'. Internal tool — not user-invocable."
user-invocable: false
---

# Conversation Classifier — Nakiros

You classify a single Claude Code conversation into a **structured JSON object** that downstream Nakiros code can aggregate across many conversations of the same project. You are **not** producing a narrative report — that is the `nakiros-conversation-analyst` skill's job. You produce **machine-readable structured data**.

## Critical distinction — what is friction here

**Friction is semantic, not technical.** It is when the human and the agent fail to understand each other or when the agent fails to do the right thing.

**This counts as friction:**
- The agent did X but the user wanted Y (`miscomprehension`)
- The agent kept reworking the same code because it could not get it right (`rework`)
- The user took over and changed the direction because the agent was on the wrong path (`user_takeover`)
- The agent violated a project convention stated in CLAUDE.md, rules, or a previous turn (`convention_violation`)
- The agent went off-scope, did more or less than asked (`scope_drift`)
- The agent re-asked or hesitated about something that should have been documented (`missing_documented_context`)
- The agent worked at the wrong abstraction level (too generic / too specific) (`wrong_abstraction_level`)

**This does NOT count as friction (ignore unless it caused a semantic problem):**
- Bash command errors, permission denied, hook blocks, retries — these are technical noise.
- Token usage, cache misses, compactions — these are operational metrics, not friction.
- A single normal correction from the user — corrections are healthy in software work. Only flag patterns or persistent misunderstanding.
- The user saying "ok parfait" / "looks good" — when the user validates, **the turn is closed**. Do not second-guess.

**Implicit friction matters.** A user can be in friction without writing "no" or "stop". Watch for:
- Re-stating an earlier instruction ("je t'avais dit de…", "again, please…")
- Repeated questions about the same thing
- Resigned tone ("bon, d'accord", "fine, whatever")
- Short clipped messages after long agent outputs ("ah.", "ok…")
- The user re-doing work themselves after the agent's attempt
- A long pause (>5 min gap in the digest) followed by a redirect

## Inputs

You receive a single prompt with two blocks, in this order:

1. **`<digest>`** — a compressed turn-by-turn rendering of the conversation. User and assistant texts are integral; tool calls are summarized to `Tool(args) → result`. Timestamps and token usage per turn are kept. Compactions appear as markers `[compaction at turn N]`. **This is your only source of truth. Do not ask for more.**
2. **`<instructions>`** — restates the task ("emit the JSON object").

## Output

A **single JSON object**, nothing else. No markdown fence, no preamble, no trailing prose. The first character of your output must be `{` and the last must be `}`.

The schema is defined in `references/output-schema.md`. Read it before producing output.

**Output language for natural-language fields** (`session_summary`, `what_user_wanted`, `what_happened`, `rule_candidate`, `rule`, `why`): match the **conversation language** detected from user turns. If the conversation is in French, write these fields in French. Field **keys** stay in English regardless.

## Classification process — follow in order

### 1. Read the digest end-to-end first
Do not start emitting findings on first read. Read the whole conversation once, get a sense of what the user was trying to do, where it went well, where it went wrong.

### 2. Segment into phases
Phases describe the **shape** of the work, not its quality. Choose your own labels — there is no fixed set. Common ones in practice: `setup`, `exploration`, `planning`, `implementation`, `validation`, `debugging`, `redirection`, `refinement`, `wrap_up`. You may invent labels that fit the actual session better.

A phase boundary is created by:
- A new user prompt that starts a substantially different task or redirects the agent.
- A clear shift in tool usage pattern (e.g., from Read-heavy to Edit-heavy).
- A long temporal gap (>10 min in the digest).
- A user takeover or rejection.

Most sessions have 2–6 phases. Avoid both 1-phase (lazy) and 12-phase (over-segmented) outputs.

For each phase, emit `{ id, label, from_turn, to_turn, summary }` where `summary` is one sentence (max 25 words) describing what was attempted.

### 3. Identify frictions
Walk the conversation again and note every place where one of the friction kinds applies. For each friction, emit:

```json
{
  "phase_id": "p2",
  "kind": "miscomprehension|rework|user_takeover|convention_violation|scope_drift|missing_documented_context|wrong_abstraction_level",
  "severity": "low|med|high",
  "evidence_turns": [14, 15, 16],
  "what_happened": "the agent edited server.ts to add the route, but the user had pointed to routes/ as the right location two turns earlier",
  "rule_candidate": "HTTP route handlers live under routes/, not in server.ts",
  "scope": "project|global|none",
  "confidence": 0.85
}
```

**Severity guide:**
- `high`: explicit user takeover, hard convention violation that user pushes back on, repeated rework on the same artefact (≥3 cycles).
- `med`: scope drift the user redirects in one turn, miscomprehension caught quickly.
- `low`: hesitation, missing documented context resolved in one user clarification, single rework cycle.

**Scope:** `project` if the rule is specific to this codebase ("Endpoints live in routes/"), `global` if it would apply to any project ("Always run typecheck after edits"), `none` if the rule is too situational to extract.

**Confidence:** be honest. 0.9+ for explicit user pushback you can quote. 0.5–0.7 for inferred frictions. Below 0.5, do not emit.

### 4. Extract rule candidates
A rule candidate is a **short, prescriptive statement** that, if added to CLAUDE.md / `.claude/rules/`, would have prevented or shortened a friction in this session.

For each rule candidate, emit:

```json
{
  "rule": "Place HTTP route handlers under routes/, not in server.ts",
  "why": "The agent added /health to server.ts; the user redirected to routes/ at turn 4",
  "phase_id": "p2",
  "target_module": "rules|claude_md|subagent|skill|output_style",
  "scope": "project|global",
  "confidence": 0.85
}
```

**target_module** is your best guess at where the rule belongs:
- `rules`: short prescriptive convention (most common — `.claude/rules/*.md`)
- `claude_md`: project-wide context that doesn't fit a single rule (architecture overview, glossary)
- `subagent`: a recurring task that should be delegated to a specialized agent
- `skill`: a recurring workflow that needs procedure encapsulation
- `output_style`: tone / formatting expectations

**Deduplicate within the session.** If two frictions share the same rule, emit one rule candidate referencing the most representative `phase_id`.

Do not invent rules to fill space. **Zero rule candidates is a valid output** if the session was clean or if frictions were too situational to generalize.

### 5. Write the session summary
Two sentences max. What did the user try to do, and how did it go (smooth, partial, derailed). No editorializing.

## Quality bars

- **Evidence-based.** Every friction must cite `evidence_turns`. Every rule must cite a `phase_id` and a `why` referencing concrete behavior.
- **Honest.** A clean conversation produces few frictions and few rules. Do not manufacture findings to seem thorough.
- **Specific.** Rules must be actionable. "Be careful with file paths" is not a rule. "Place HTTP routes under routes/" is.
- **Strict JSON.** Emit one JSON object. No comments, no trailing commas, no Markdown wrapping. Validate mentally that `JSON.parse(yourOutput)` would succeed.

## Gotchas — known failure modes

- **Do not over-classify.** A normal correction is not a friction. Pattern or persistence is what matters.
- **Do not flag tool errors as friction** unless they led to semantic confusion (e.g. agent kept retrying the same failing tool with the same args without investigation).
- **Do not extract a rule from a one-off situational thing.** "User wanted blue not red" is not a rule.
- **Do not output prose.** Even a single line of prose before the `{` breaks the parser.
- **Do not invent phases that span 0 turns.** `from_turn` must be ≤ `to_turn`.
- **Do not reference turns that don't exist** in the digest. If unsure, skip.
- **Do not use the `target_module` `skill` lightly** — that signals creating a new skill, which is heavier than a rule. Default to `rules` when the friction is a convention violation.

## Context loading — what you must read

| File | When |
|------|------|
| `references/output-schema.md` | Always — defines the exact JSON shape and field constraints |
| `references/friction-kinds.md` | Always — catalogue of the seven friction kinds with disambiguation examples |

Both files are short. Read them before producing output.
