# Friction kinds — disambiguation guide

Seven kinds. Pick the **most specific** one that fits. When two kinds could apply, prefer the one closer to the **root cause** (e.g. `convention_violation` is a more specific cause than `rework`).

## 1. `miscomprehension`

**Definition:** the agent misunderstood what the user wanted, and produced something different from the ask.

**Signals:**
- Agent's first attempt is on a different topic / scope than the user described.
- User's next turn says "no, I meant…" or restates the original ask in different words.
- Output addresses a misread of the prompt (singular vs. plural, action vs. question, etc.).

**Examples:**
- User asks "show me the diff" → agent runs `git log`. *miscomprehension*.
- User asks "fix the auth bug" → agent rewrites the entire auth module. *scope_drift* (more specific).

**Not this:** if the agent did the right thing but at the wrong abstraction level → that's `wrong_abstraction_level`. If the agent did exactly what was asked but the user changed their mind after seeing it → that's not friction at all.

## 2. `rework`

**Definition:** the agent kept iterating on the same artefact because it could not get it right, with multiple attempts on the same file/function/behavior.

**Signals:**
- ≥3 Edit/Write cycles on the same file in a single phase, each followed by user feedback or a tool error.
- Agent repeatedly fixes its own previous edit.
- Tests / typecheck fail multiple times on the same file.

**Severity:**
- `low`: 2 cycles, resolved.
- `med`: 3-4 cycles.
- `high`: 5+ cycles, or user explicitly comments on the looping ("you've tried this already").

**Not this:** intentional refactoring that touches a file multiple times in coherent steps is **not** rework — rework requires that **the same problem** is being re-attacked.

## 3. `user_takeover`

**Definition:** the user explicitly stops the agent's direction and takes control to redirect, rewrite, or restart.

**Signals:**
- User turn includes "stop", "wait", "non, on fait autrement", "let me do this myself", "actually let's…".
- User turn provides a complete alternative solution rather than a hint.
- User turn is significantly longer than recent ones, often with explicit instructions.
- The session changes direction sharply after this turn.

**Severity is usually `high`** — takeovers are by nature explicit and significant.

**Not this:** a user who clarifies and lets the agent continue is not a takeover. The takeover involves a clear seizure of direction.

## 4. `convention_violation`

**Definition:** the agent did something that violates a convention of the project (stated in CLAUDE.md, in a previous session turn, or implied by the file structure the agent had access to).

**Signals:**
- User pushes back with "we don't do X here" or "this project uses Y instead".
- The agent's edit goes against patterns visible in files it has already read.
- User cites a rule, document, or precedent.

**Severity:**
- `high`: user explicitly cites the rule and pushes back.
- `med`: user redirects without citing the rule, but the violation is clear from context.
- `low`: minor stylistic deviation.

**This is the highest-value kind for rule extraction** — convention violations almost always produce a clean `rule_candidate`.

## 5. `scope_drift`

**Definition:** the agent did substantially more or less than asked.

**Signals:**
- "Just fix the typo" → agent reformats the entire file. (over-scope)
- "Refactor this module" → agent only renames one variable. (under-scope)
- User turn says "I didn't ask for X" or "you forgot Y".

**Not this:** drift is about **scope of change**, not direction. If the agent worked on the wrong feature, that's `miscomprehension`.

## 6. `missing_documented_context`

**Definition:** the agent (re-)asks or hesitates about something that should have been available to it from CLAUDE.md, rules, or earlier in the session.

**Signals:**
- Agent asks "where is X located?" when X is in a standard place.
- Agent asks "which package manager?" when there's a `pnpm-lock.yaml` it could check.
- Agent re-asks the same kind of question across turns.
- User responds with a note like "as I said earlier" or "this is in CLAUDE.md".

**This is the second-highest-value kind for rule extraction** — produces excellent `claude_md` candidates.

**Not this:** legitimately ambiguous questions are not friction. Friction is when the answer **was findable** and the agent did not look.

## 7. `wrong_abstraction_level`

**Definition:** the agent's output is at the wrong level of generality — too generic where specifics were wanted, or too specific where a pattern was wanted.

**Signals:**
- User asks for a one-liner, agent produces a class hierarchy. (over-abstract)
- User asks for a generic helper, agent hard-codes one case. (under-abstract)
- User says "make it more reusable" / "you don't need to be that generic".

**Severity:** typically `low` to `med` — abstraction issues are usually corrected in a single turn.

## Tie-breaking rules

When two kinds apply:

1. **`convention_violation`** beats everything else if a project rule was broken.
2. **`user_takeover`** beats everything if the user explicitly stopped the agent.
3. **`miscomprehension`** beats `scope_drift` and `wrong_abstraction_level` if the agent worked on the wrong thing entirely.
4. **`rework`** is never the only kind — there is always a deeper cause (`miscomprehension`, `convention_violation`, etc.). Emit the deeper cause first; emit `rework` only if the cycle pattern is itself the salient signal.
5. **`missing_documented_context`** is independent of the others — emit it alongside if the agent should have known.

## Frequency expectations

In a healthy 30-turn session, expect:
- 0-2 frictions, mostly `low` severity.
- 0-1 rule candidates.

In a clearly degraded session, expect:
- 3-6 frictions, mix of severities.
- 1-3 rule candidates.

If you find yourself emitting >8 frictions or >5 rules in a single session, you are over-classifying. Re-read and consolidate.
