# Domain — Argos

> Argos is an internal business domain of Nakiros, not a separately installed
> product or npm package.

> Ἄργος, *the all-seeing*. Conversation analysis, drift detection, friction
> recommendations.

## Scope

Analyse a single conversation, detect topic/context drift, and aggregate
friction patterns across conversations into actionable recommendations. **An
optional workflow** — users can use Techne and Hestia without analysing their
conversations, and those domains do not depend on Argos internals.

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

- Reworked **topic** detector: a Unicode lexical anchor after structural resets
  and sustained departure replace `firstLastSimilarity` and the monotonic
  transition trigger. No intent vocabulary is encoded; intentional reframing
  and plan progression are resolved by agent adjudication.
- **Two-tier with in-conversation adjudication**: the cheap local gate only
  *suspects*; the agent already in the conversation confirms or denies via a
  hidden verdict tag, read by the `Stop` hook. A denied drift is remembered and
  **suppressed** — no re-firing every message (today's bug: 12× in one session).
- Self-adjudication kills false positives; a strong+sustained local signal
  overrides complacency for real drift.
- Claude and Codex JSONL ingestion feed the same provider-neutral detectors.
- The Argos hook installer targets only compatible agents detected locally;
  single-agent setups remain first-class and comparison is never required.
- Topic adjudication decisions survive daemon restarts and an old transcript
  verdict can never resolve a newer pending review.
- Codex friction scoring uses only structural repetition and native abort
  events. No correction or intent vocabulary is embedded in the analyzer.
- Claude and Codex are adapted into one `NormalizedConversation` contract
  before deep analysis. The deep-analysis prompt, cache and streaming runner
  are provider-neutral; cache keys isolate providers and reject changed
  transcripts.
- The narrative analyzer follows the source provider by default: Claude
  conversations run through Claude, Codex conversations through
  `codex exec --json`. Both receive the same embedded analysis protocol and
  feed the same report UI; projects with a single agent keep a single path.
- Conversation diagnostics share one screen hierarchy. Provider capability
  gaps remain explicit instead of creating a second Codex-only workflow.
- Agent comparison is progressive: it stays absent for a single-agent project
  and appears only when at least two providers have real conversations. It
  exposes normalized metrics, coverage and uncertainty without ranking agents
  whose tasks are not paired.
- Topic/context drift uses a bounded conversation-local semantic graph. Early
  assistant plans and repeated explanations enrich the user goal without a
  language dictionary, network call or downloaded model.
- Recommendations cross domains through an explicit review route. Skills target
  Techne; agent configuration targets Hestia. The target domain launches its
  own runner only after the user confirms the reviewed brief.

## Remaining open questions

- Embedding source for local semantic similarity and calibration of the
  sustained-departure window.
- Replace the temporary `/clear` boundary thread signature with a semantic goal
  signature when the goal-anchor model lands.
