# Domain — Argos (detailed design)

> Argos is an internal business domain of Nakiros. It may be unused by a user,
> but it ships and runs inside the same product as Techne and Hestia.

> Detailed design for [Argos](argos.md). Read [03-module-contract.md](../03-module-contract.md)
> and [05-inter-module-contracts.md](../05-inter-module-contracts.md) first.

## What Argos is

The optional observability module: analyse conversations, detect drift in real
time, and surface friction patterns as recommendations. Argos **produces**
`RecoCard`s; it never applies them (Hestia/Techne consume — see doc 05).

Three real-time detectors run from opt-in hooks (`Stop` + `UserPromptSubmit`):
`topic`, `context`, `loop`. This document reworks the **topic** detector, whose
job is the hardest and most valuable: telling **drift** apart from a legitimate
**deep-dive**.

## The problem: drift vs deep-dive

```
DEEP-DIVE (on-task)                    DRIFT (off-task)
   goal                                  goal ──────✗ abandoned
    ├─ vision                             │
    ├─ architecture                       └─ a tangent takes over, with no
    ├─ manifest                               explicit re-framing — a new,
    └─ modules (hestia/techne/argos)          disconnected trunk
   every sub-topic descends from         the originating goal was dropped
   the SAME goal
```

A focused session that works through an agenda visits many sub-topics yet never
leaves its goal. A naive detector reads that as maximal drift.

## Why the legacy detector false-positive

`topic-detector.ts` uses lexical Jaccard between consecutive messages
(`< 0.15` = a transition) and Jaccard between the first and last user message
(`< 0.10` = drift), firing when `transitions ≥ 2 AND firstLast < 0.10`. Six
flaws, every one of them demonstrated by the very session in which this design
was written:

1. **Lexical, not semantic.** "vision", "manifest", "runner", "hestia",
   "techne", "argos" are disjoint tokens; the vocabulary rotated, so similarity
   ≈ 0 — though it was all one subject (designing the suite).
2. **First↔last similarity is a false proxy.** In any healthy progressing
   conversation the last message is lexically far from the first ("rethink the
   product strategy" → "ok let's do argos"). Low first-last similarity =
   *progress*, not *abandonment*. This is the main culprit (our score ~1%).
3. **The transition counter never decreases** (except on `/clear`); every
   sub-topic increments it forever, so `≥ 2` trips early and stays tripped (we
   went from 5 to 12 transitions without ever drifting).
4. **No goal model.** The "objective" is just message[0]'s tokens; nothing
   represents the real goal or whether a new topic is a *child* of it.
5. **Navigation messages count as transitions.** "ok let's do argos", "on
   continue" share ~0 tokens with neighbours → counted as drift, when they are
   *steps in a plan*.
6. **Following a plan is the opposite of drifting**, yet the algorithm reads an
   executed checklist as maximal rupture.

## The improved topic model

Four changes of substance:

1. **Semantic goal anchor.** Derive the goal from the opening messages after a
   structural reset — not message[0] alone. Measure the distance of the
   *recent window* to this anchor, never first↔last. Intentional re-framing is
   judged by the conversational agent, not by language-specific keywords.
2. **Semantic similarity (embeddings)**, not Jaccard, so vision↔architecture↔
   modules read as related.
3. **Plan / navigation awareness.** The conversational agent decides whether
   the session is executing a checklist. The local gate only excludes short,
   non-substantive messages using a language-neutral token-count threshold.
4. **Sustained departure, not a counter.** Drift = a trajectory that moves away
   from the goal **and stays away** over K messages with no return. A deep-dive
   orbits the goal; drift escapes it.

## Two-tier detection with in-conversation adjudication

> Implemented for `topic` signals. `UserPromptSubmit` opens one pending review,
> `Stop` reads the fresh sentinel verdict from the provider transcript, and the
> decision is persisted under `~/.nakiros/drift/adjudications.json`. The local
> gate now uses a Unicode lexical anchor after structural resets and a
> sustained-departure window. It contains no intent or navigation keyword
> dictionary. Early assistant explanations now form a conversation-local
> semantic graph: structured plan nodes enrich the goal directly and prose
> concepts require repeated connections. No model is downloaded by the daemon.

The key architectural decision (and the cheapest accurate design): **do not
spawn a separate LLM to adjudicate. Ask the agent already in the conversation —
it has full context and is the best judge — then read its verdict.**

```
UserPromptSubmit hook ──▶ Tier 1: cheap local gate (no LLM)
   │   if suspicious AND this thread not already adjudicated:
   │   inject additionalContext:
   │     "Nakiros suspects drift (evidence …). Confirm or deny: is this a
   │      continuation/deep-dive of the goal, or genuine drift? End your reply
   │      with <!-- nakiros-drift: on-track --> or <!-- nakiros-drift: drifting -->."
   ▼
agent answers in its turn (judges with the full conversation) ──▶ emits verdict tag
   ▼
Stop hook ──▶ reads the assistant message, parses the verdict tag
   ├─ on-track  → persist "thread <sig> confirmed on-track" → SUPPRESS re-sends
   └─ drifting  → only now surface the banner to the USER (suggest /clear, refocus)
```

### Tier 1 — local gate (`UserPromptSubmit`)

Fast, local, no LLM. Computes the improved features above. **Calibrated to rarely
fire on its own** — it only opens the gate to adjudication. This bounds cost: the
agent is asked at most once per thread, not per message.

### Tier 2 — the in-conversation agent is the judge

We reuse the agent already running. The hook's `additionalContext` asks it to
confirm or deny. This is exactly what happens organically today (the agent reads
the banner and says "false positive, we're deep-diving") — we simply **capture**
that verdict instead of ignoring it.

### Verdict parsing

A **discrete sentinel tag** the agent is asked to emit
(`<!-- nakiros-drift: on-track | drifting -->`, hidden as an HTML comment),
parsed deterministically by the `Stop` hook. Preferred over fuzzy NLU of free
text — reliable and cheap. Fallback: a light heuristic classifier if the tag is
absent.

### Suppression memory

Per session, keyed by a **goal/thread signature**, the `Stop` hook records the
agent's verdict. While the thread holds and the verdict is `on-track`, Tier 1
**suppresses** — no re-injection. This is the missing piece today: the detector
has no memory of the agent's verdict, so it re-fires every message (12× in this
session).

### Re-adjudication triggers

Re-ask the agent only when the trajectory **changes materially**:

- the recent window departs from the anchor by more than the gate margin again,
- an explicit goal-shift / re-framing is detected,
- a `/clear` resets the window.

Not on every message.

### Bias caveat (and mitigation)

Self-adjudication by the in-conversation agent is **excellent at killing false
positives** (the actual pain) but has a complacency bias for **real** drift (the
agent may rationalise "we're fine"). Mitigation, by calibration not blocking: if
the local signal is **strong and sustained** over many messages, re-adjudicate
and/or surface to the user regardless of a prior `on-track`. Tune, don't trust
blindly.

## The other detectors

`context` and `loop` keep their roles; `topic` gets the rework above. The
two-tier adjudication pattern is reusable by `context`/`loop` if they prove
false-positive-prone, via the same verdict tag + suppression memory.

## Conversation analysis & recommendations (existing)

`conversation-{analyzer,deep-analyzer,analysis-cache}` do single-conversation
analysis; `recommendation-*` cluster friction zones and run the analyser that
emits recommendation cards through the shared contract. `baseline-store`
and `comparison-runner` support before/after comparison. `project-scanner` /
`claude-config-reader` are **read via the kernel layer** (coupling #3, doc 07).

## Multi-AI

- **Current:** ingest Claude Code and Codex conversations through native JSONL
  adapters. Both are normalised before reaching the shared analysis and drift
  detectors.
- **Real time:** Argos installs the same opt-in `Stop` and `UserPromptSubmit`
  observation pair for each detected compatible agent. Claude writes to
  `~/.claude/settings.json`; Codex writes to `~/.codex/hooks.json` and keeps its
  own trust-review flow.
- **Later:** Gemini, Cursor and other transcript formats can add adapters
  without changing the drift model.

## Inter-module

Argos produces recommendations but never applies them. Hestia and Techne
register consumers for their target types; the shell renders "Apply" only when
the target and action are supported. See doc 05.

## Screens / services / IPC

- Screens: `DriftDetectionPanel`, `ConversationIngestPanel`, `ScanView`,
  `ProjectOverviewScreen`, `components/{conversations,recommendations,viz}/`.
- Services: `analyze-convo-runner`, `classify-convo-runner`,
  `conversation-{analyzer,deep-analyzer,analysis-cache}`, `drift/`,
  `drift-analyzer`, `baseline-store`, `comparison-runner`,
  `project-{scanner,aggregate-cache}`, `recommendation-*`.
- IPC namespace: `argos:*` (analyze-convo, classify-convo, drift-hook,
  comparison, recommendations, conversation-ingest, projects).

## v1 scope

- Two-tier in-conversation adjudication and persistent suppression memory for
  `topic` signals.
- Language-neutral Unicode lexical fallback with `/clear` as a structural
  boundary and sustained-departure scoring.
- Conversation-local semantic links and structured plan awareness from early
  assistant messages are implemented. Optional offline embeddings remain a
  future calibration path, not a runtime dependency.
- Existing analysis + recommendation features re-homed into Argos.
- Claude and Codex JSONL ingestion, including native Codex context and tool
  error signals.
- Structural Codex friction signals, a shared `NormalizedConversation`
  contract, provider-aware deep analysis and one diagnostic screen are
  implemented. Provider-specific data remains visible inside the common
  hierarchy.
- Deep narrative analysis is provider-matched, not provider-first navigation:
  the conversation determines whether Claude or Codex executes the shared
  protocol. Reports retain both the source provider and analyzer provider so
  cached evidence cannot be confused across engines.
- Mixed Claude/Codex projects expose an observational comparison table. The
  daemon returns analyses and comparison evidence in one snapshot so the UI
  does not rescan conversations. Metrics include sample coverage and period
  overlap; unpaired tasks prevent Argos from presenting a winner.

## Annex — concrete fix to `topic-detector.ts`

Implementation status and remaining semantic upgrade:

1. **Implemented:** `firstLastSimilarity` and the monotonic transition trigger
   are gone.
2. **Implemented:** the lexical goal anchor resets on the structural `/clear`
   boundary. Intentional re-framing is left to Tier 2 adjudication.
3. **Implemented:** a departure must persist for three substantive messages.
4. **Implemented:** short non-substantive messages are excluded by token count,
   without matching words or languages.
5. **Implemented:** Tier 1 suspicion, Tier 2 verdict and persistent suppression.
6. **Implemented:** enrich lexical connection with a bounded, conversation-local
   semantic graph built from assistant explanations.
7. **Implemented:** derive early plan state from language-neutral Markdown list
   structure and connect its concepts to the goal anchor.

## Open questions for implementation

- Whether an optional bundled embedding model materially improves calibration
  enough to justify its binary size and platform cost.
- Exact thread-signature definition for the suppression key.
- Calibration of K (sustained-departure window) and the strong-signal override.
- Verdict tag vs heuristic parse robustness across agent phrasings.
