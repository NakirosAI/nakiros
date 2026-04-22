# Friction patterns — beyond keyword matching

This document catalogues the patterns of user friction that a regex cannot catch. Use it as a checklist when reading the conversation.

## Category A — Explicit negations (already caught by stage 1)

- "no", "non", "stop", "don't", "pas ça", "revert", "undo", "wrong", "that's not", "actually"

Stage 1 flags these. You may still quote them for evidence but don't re-count.

## Category B — Implicit frustration

### Tone markers

| Pattern | Example |
|---------|---------|
| Short one-word answer to an offer | Assistant: "Shall I do X?" → User: "oui." (end of patience) |
| Rhetorical question | "pourquoi tu as fait ça ?" / "why did you even do that?" |
| Sigh of resignation | "bon…", "ok bon", "alright fine", "well I guess" |
| Disappointed confirmation | "ah ouais bah…", "yeah ok then", "je vois" |
| Short dismissive ack | "ok.", "d'accord.", "right." (followed by topic change) |

### Behavioural markers

| Pattern | Meaning |
|---------|---------|
| User repeats a request verbatim | The assistant ignored the request the first time |
| User paraphrases the same instruction with added emphasis | User is patient but the assistant misread the first ask |
| User quotes their own earlier message back at the assistant | Strong signal the assistant drifted |
| User switches language (FR→EN or vice versa) mid-conversation | Often happens when patience snaps |
| User takes over and writes the code themselves | Total loss of trust in the assistant |
| User abandons mid-task (stops replying) | Silent failure — very hard to detect but real |

### Escalation patterns

Watch for sequences like:
1. User corrects politely
2. Assistant repeats mistake or creates a new one
3. User corrects more pointedly
4. Assistant repeats again
5. User gives up or takes over

This is the classic "death spiral" and warrants a critical flag.

## Category C — Context drift signals

Context drift = the assistant behaves as if it forgot information given earlier.

### Symptoms

- User references a file by name → assistant asks "which file?" or edits the wrong file.
- User had set a rule early ("don't touch the database") → assistant breaks the rule later.
- Assistant suggests an approach the user already rejected ("actually let's use SQLite" — 400k tokens later: "I propose we use SQLite").
- Assistant re-asks a question already answered.
- Assistant forgets the user's stated goal and over-scopes.

### How to quantify

When you spot drift, estimate:
- **Turn gap**: how many user turns between the original information and the forgotten moment. Big gap + big context = lost-in-the-middle.
- **Criticality**: was it a rule (high) or a minor detail (low)?

Report the gap and criticality per drift instance.

## Category D — False-positive filters

Not all of these are friction. Discard when:

- The user is thinking out loud in French ("bon, donc on va faire…") — that's narrating, not frustrating.
- The user is meta-discussing the workflow ("ok maintenant on passe à autre chose") — that's progression.
- The user asks the assistant to backtrack as part of a valid workflow (e.g., trying an alternative approach) — that's iteration, not friction.
- A single "non" in a larger constructive message ("non pas comme ça, fais plutôt X") — that's a correction, not a crisis. One is normal.

Flag friction only when multiple signals co-occur or when the same signal repeats across several turns.

## Scoring hints

When building the "Friction & frustration" section of the report:

- 0-1 isolated correction → mention briefly, don't emphasize
- 2-4 scattered frictions → discuss as a moderate pattern, look for common cause
- 5+ frictions, or any death spiral, or silent abandonment → lead with this, it's the main story
