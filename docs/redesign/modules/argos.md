# Module — Argos

> Ἄργος, *the all-seeing*. Conversation analysis, drift detection, friction
> recommendations.

## Scope

Analyse a single conversation, detect topic/context drift, and aggregate
friction patterns across conversations into actionable recommendations. **An
optional module** — other modules do not depend on it.

## Capabilities

- `provides`: `recommendation.producer` — emits `RecoCard`s.
- `consumes`: (none) — Argos is purely a producer; it never applies its own
  cards. Hestia/Techne consume them (doc 05).

## Screens (front)

`DriftDetectionPanel`, `ConversationIngestPanel`, `ScanView`,
`ProjectOverviewScreen`, `components/conversations/`, `recommendations/`,
`viz/`.

## Backend services

`analyze-convo-runner`, `classify-convo-runner`,
`conversation-{analyzer,deep-analyzer,analysis-cache}`, `drift/`,
`drift-analyzer`, `baseline-store`, `comparison-runner`,
`project-{scanner,aggregate-cache}`, all `recommendation-*`
(cluster, analyze-runner, apply, card-parser, inventory, store).

> Note: `project-scanner` / `claude-config-reader` are *read* by Argos but
> **owned by the kernel** read layer (coupling #3 in doc 07). Argos consumes,
> does not own.

## Bundled skills

`nakiros-conversation-analyst`, `nakiros-conversation-classifier`,
`nakiros-recommendation-analyzer`. Run through the shared runner.

## IPC namespace

`argos:*` (handlers: analyze-convo, classify-convo, drift-hook, comparison,
recommendations, conversation-ingest, projects).

## Drift vs deep-dive — a first-class requirement

The drift detector must distinguish genuine **drift** (the session wandered off
its goal) from a legitimate **deep-dive** (one decision explored end-to-end,
with many sub-topics that are all on-task).

A naive topic-transition counter produces false positives: during the design of
this very redesign, a focused product/architecture discussion tripped the
detector with "5 transitions, 0% similarity to the first message" — yet it never
left the subject. Concretely, the detector should weigh:

- whether successive topics are *children* of the originating goal vs unrelated,
- whether the user keeps confirming/advancing the same thread,
- recency and intent of `/clear`, not just raw transition count and first-vs-last
  similarity.

This nuance is a product differentiator, not an edge case.

## Detailed design

See [`argos-design.md`](argos-design.md). Key resolved decisions:

- Reworked **topic** detector: semantic goal anchor + plan/navigation awareness
  + sustained-departure (drop `firstLastSimilarity`, the main false-positive
  source).
- **Two-tier with in-conversation adjudication**: the cheap local gate only
  *suspects*; the agent already in the conversation confirms or denies via a
  hidden verdict tag, read by the `Stop` hook. A denied drift is remembered and
  **suppressed** — no re-firing every message (today's bug: 12× in one session).
- Self-adjudication kills false positives; a strong+sustained local signal
  overrides complacency for real drift.
- v1: Claude JSONL ingestion; other agents later.

## Remaining open questions

- Embedding source for local semantic similarity; thread-signature for the
  suppression key; calibration of the sustained-departure window.
