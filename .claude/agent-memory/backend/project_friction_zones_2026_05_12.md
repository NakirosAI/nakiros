---
name: project_friction_zones_2026_05_12
description: ConversationFrictionZone shipped 2026-05-12 — v10 stuck-cluster algorithm (user stuck on topic = zone trigger)
metadata:
  type: project
---

`ConversationFrictionZone` shipped 2026-05-12 (commit fcbab94, branch feat/sentiment-prepass).

**Why:** Flat `frictionPoints[]` only records the user reaction moment. Zones add the preceding agent turns so the UI can show what the agent did wrong (files touched, errors, backtracks) alongside the user frustration.

**How to apply:** When building new friction UIs, always use `frictionZones[]` for the rich view. Keep `frictionPoints[]` for score/badge/aggregate consumers — it is the backward-compat contract.

## New types
- `ConversationFrictionZone` in `packages/shared/src/types/project.ts` (after `ConversationFrictionPoint`)
- `frictionZones: ConversationFrictionZone[]` added to `ConversationAnalysis`

## New intermediate types in conversation-analyzer.ts
- `AssistantToolUseInfo`: `{ toolName, filePath, bashCommand }` — one per tool_use in a turn
- `AssistantTurnRecord`: `{ turn, timestamp, toolUses[] }` — collected per assistant entry
- `UserTurnRecord` / `userTurnTimestamps` map: timestamp per userMsgIdx for zone boundary calc

## Detection algorithm
- `sentiment:*` and `repetition:*` frictionPoints → always emit a zone
- `backtrack:*` frictionPoints → emit zone only if no user-reaction friction within next 5 user msgs (else absorbed into downstream zone's `backtrackedFiles`)
- `startTurn` = walk backward from endTurn through consecutive assistant turns (no user msg gap)
- `endTurn` = last assistant turn before the reaction timestamp
- Zone id: `<sessionId>:<endTurn>:<reactionKind>:<zoneIndex>` (zoneIndex added for uniqueness when two reactions land on same endTurn)

## Error detection
- Second pass builds `erroredToolUseIds: Set<string>` — detects `is_error: true` + string heuristics (`"Error:"` / `"<tool_use_error>"`)
- `toolUseTurnById: Map<string, number>` maps tool_use_id → assistant turn for zone error counting
- Tool name attribution in zones is approximate (last tool in turn) — known limitation

## Severity rules
- `high`: user reaction + (≥1 backtrackedFile OR ≥2 toolErrorsCount)
- `medium`: user reaction, no strong agent trigger
- `low`: backtrack-only zone (no user reaction)

## Smoke results v8 (real session, 11MB JSONL)
- frictionPoints: 42 (8 backtrack + 34 user-reaction)
- frictionZones: 34 (all 34 user-reaction → zones; backtracks absorbed)
- Cache: v7 → v8

## v9 multi-signal convergence (commit 7bcb2ed)
Algorithm completely replaced: zones now require ≥ 2 distinct signals (S1/S2/S4/S5/S6) within an ABS_WINDOW=30 entry proximity window. Adjacency graph → BFS connected components → one zone per component.

New signals S5 (tool error spike ≥ 2 in 5 assistant turns) and S6 (repeated "string not found" error on same file).

`signalKinds: Array<'S1'|'S2'|'S4'|'S5'|'S6'>` added to `ConversationFrictionZone` (optional for backward-compat with v8 cache).

Severity: 2 signals → medium, 3+ → high. `low` never emitted.

Fallback for user-only clusters (S1+S2, no agent turn in range): finds closest assistant turn by absolute index distance.

Smoke v9: frictionPoints=42 (unchanged) · frictionZones=7 · all medium · zones [S1+S5, S1+S2, S1+S2, S1+S4, S1+S4, S1+S4, S1+S4] · Cache v8→v9.

## v10 stuck-cluster algorithm (commit e2f30b7, 2026-05-12)

Complete redesign of `buildFrictionZones`. A zone now = user stuck on same topic.

Algorithm:
1. `tokenizeForCluster(text)` — lowercase + split /\W+/ + drop <3 chars + drop STOP_WORDS (FR+EN Set at module scope)
2. Union-Find over user messages: connect (i,j) if j.userMsgIdx - i.userMsgIdx <= 10 AND Jaccard(tokens_i, tokens_j) > 0.3
3. Filter: clusterSize >= 3, minCounter > 10 (setup skip), span <= 10
4. Enrichments S1/S4/S5/S6 (sentiment/backtrack/errors) bump severity but don't create zones. S2 removed from union.
5. Severity: base clusterSize>=5 → high, else medium. Bumped to high if any enrichment.
6. reactionPoint = last cluster message, pattern = `stuck-cluster:<size>:<jaccardAvg>`

New fields on `ConversationFrictionZone`:
- `clusterSize: number` (required)
- `severity: 'medium' | 'high'` (no more 'low')
- `signalKinds?: Array<'S1' | 'S4' | 'S5' | 'S6'>` (S2 removed)

Cache v9 → v10.

Smoke v10 (real session 136 user messages):
- frictionPoints (Signal C approx): 4
- frictionZones: 2 clusters
  - Zone 1 (msgIdx 13-19): 3× "[Request interrupted by user for tool use]", jaccardAvg=1.00, medium — edge case: identical system-artifact messages form a spurious cluster. Acceptable for now (algorithm correct, UI will show excerpt).
  - Zone 2 (msgIdx 104-113): 3 messages about `/nakiros/skills/nakiros-skill-factory` eval operations, jaccardAvg=0.70, medium. Legitimate stuck cluster.

KEY GOTCHA: `negativeUserIndices` map must be passed as new param to `buildFrictionZones` (for S1 enrichment detection). Existing parameter list for that function was extended; callers inside `analyzeConversation` must pass it.

KEY GOTCHA: Frontend `ConversationTimeline.tsx` had `k === 'S1' || k === 'S2'` — must drop `|| k === 'S2'` since S2 no longer in the union type (TS2367 error).

[[project_sentiment_batch_d_2026_05_12]]
[[project_signals_bce_2026_05_12]]
