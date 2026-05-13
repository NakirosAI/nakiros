# Friction Pattern Recommendations — Design

**Date**: 2026-05-13
**Status**: Draft, pending implementation
**Builds on**: friction zones v10 (`ConversationFrictionZone`, shipped 2026-05-12, v0.12.0)

## Goal

Close the loop between detected friction zones and `.claude/` configuration. When the same friction signal appears in several conversations of a project, surface it as a pattern and let the user trigger an LLM run that proposes concrete `.claude/` actions (fix or create) as reviewable markdown briefs. Applying a brief launches an existing `fix-<type>` or `create-<type>` runner, which keeps the sandbox-tmp + Apply & deploy lifecycle untouched.

## Non-goals

- The recommendation engine does **not** write to `.claude/` directly. It only produces markdown briefs.
- No cross-project clustering (v1 is per-project only).
- No semantic embeddings (Jaccard is sufficient at this volume).
- No real-time / push notifications when patterns appear.
- No dedup of similar recos across different patterns.

## Architecture

Three independent layers:

```
ConversationAnalysis.frictionZones[]   (existing, per conversation, populated at ingest)
            │
            ▼
project-recommendation-cluster.ts      (new, daemon, no LLM)
  - Loads zones from all conversations of the project
  - Jaccard similarity + file/tool/signal affinity bonus
  - Union-Find grouping, threshold zoneCount >= 2
  - Persists `patterns.json` per project (atomic write)
            │
            ▼
~/.nakiros/recommendations/<projectId>/
   ├── patterns.json
   └── <patternId>/
       ├── analysis-run.jsonl
       ├── meta.json
       └── recos/
           ├── <recId>.md          (LLM output)
           └── <recId>.json        (sidecar: type, target, status, appliedRunId)
            │
            ▼
Recommendations screen (sidebar entry, already declared as ProjectTabView 'recs')
  - List of patterns + per-pattern detail
  - Button "Analyser" → launches recommendation-analyze runner
  - Reco cards reviewable + editable
  - Button "Apply Fix" / "Create" per card
            │
            ▼ (delegates to existing runners — no changes to them)
fix-<type> / create-<type>             (existing factory runners, sandbox tmp + Apply & deploy)
```

## Layer 1 — Clustering (no LLM)

### Input
`ConversationFrictionZone[]` aggregated across every conversation of the project. Zones already produced by the analyzer at ingest time.

### Tokenization
Reuse the v10 helper, extracted into `apps/nakiros/src/services/runner-core/cluster-tokens.ts` for shared use by analyzer + clustering:

```
tokens(zone) =
  tokenizeForCluster(reactionPoint.text.slice(0, 200))    // lowercase, /\W+/, drop <3 chars, drop STOP_WORDS (FR+EN)
  ∪ tokenizeForCluster(agentContext.keyActions.join(' '))
  ∪ basename(agentContext.filesTouched[])
```

### Similarity
```
score(A, B) = jaccard(tokens_A, tokens_B)
            + 0.10 if files(A) ∩ files(B) ≠ ∅
            + 0.05 if signalKinds(A) ∩ signalKinds(B) ≠ ∅
```

### Grouping
- Build a graph with edges `score(A, B) > 0.30`.
- Union-Find to find connected components.
- Filter `zoneCount >= 2`.
- Sort by `severity` desc, then `zoneCount` desc.
- Cap to top 20 patterns per project.

### Defensive filters
- Skip zones whose `reactionPoint.text` matches `[Request interrupted by user for tool use]` (already filtered in analyzer commit `f3b83ff`; defence-in-depth for older cached analyses).
- Skip zones whose tokens set is empty.

### When to recompute
- Hook on `onProjectIngestComplete`.
- Manual "Refresh" button on the screen.
- Cache invalidation via `CACHE_VERSION_RECOS` constant in `packages/shared`.

### Pattern persistence
Atomic write to `~/.nakiros/recommendations/<projectId>/patterns.json`.

### `RecommendationPattern` (new shared type, `packages/shared/src/types/recommendation.ts`)

```ts
export interface RecommendationPattern {
  id: string;                              // stable hash of sorted zoneRef ids
  projectId: string;
  zoneRefs: Array<{ convoId: string; zoneId: string }>;
  signature: {
    topTokens: string[];                   // top 8 tokens by frequency
    filesTouched: string[];                // union over zones
    signalKinds: Array<'S4' | 'S5' | 'S6'>;
    firstSeen: string;
    lastSeen: string;
  };
  zoneCount: number;
  severity: 'medium' | 'high';             // max across zones, bumped if zoneCount >= 4
  analysis: {
    status: 'idle' | 'running' | 'done' | 'failed';
    runId?: string;
    recoCount?: number;
    lastAnalyzedAt?: string;
  };
}
```

## Layer 2 — "Analyser" run

New `runKind = 'recommendation-analyze'`, wired on the existing `runner-core` (session jsonl, progress streaming, kill, agent-active timer — patterns already in production for create/fix/audit/eval).

### Workspace layout

```
~/.nakiros/cache/runs/recommendation-analyze/<runId>/
  ├── session.jsonl
  ├── workdir/                             # cwd of the agent
  │   ├── pattern.json                     # full input
  │   ├── inventory.json                   # existing .claude/ artefacts of the project
  │   └── recos/
  │       └── <kebab-title>.md             # produced by agent's Write tool
  └── meta.json                            # status, timing, recoCount, skippedCards[], downgradedCards[]
```

### Prompt structure (first user message)

```
ROLE
====
You are the Nakiros recommendation agent. A friction pattern has been detected
across N conversations of this project. Produce one or more recommendation
cards proposing concrete .claude/ actions that would have prevented this
friction.

PATTERN
=======
[full inlined pattern.json — never summarise]
- topTokens, filesTouched, signalKinds, severity, zoneCount
- For each zone: reactionPoint.text (full), agentContext (keyActions,
  filesTouched, toolErrorsCount, backtrackedFiles), originating convoId

EXISTING .claude/ INVENTORY
============================
[full inlined inventory.json — lists existing rules/skills/claudemd
sections/subagents/hooks/permissions/mcps/output-styles with identifiers
and short descriptions]

YOUR JOB
========
Write 1..N markdown cards to ./recos/<kebab-title>.md. Each card = ONE
atomic action. If multiple levers are needed (fix rule X + create skill Y
+ add a CLAUDE.md note), write one card per lever.

Constraints:
- The 'brief' body is passed verbatim to the downstream fix/create runner —
  make it self-contained: cite zone excerpts, exact file paths, exact errors.
  Never summarise.
- Don't invent artefacts. For 'fix', the target MUST exist in the inventory.
  If unsure, prefer 'create'.
- Output language matches the user's (FR/EN — auto-detect from zone excerpts).

[CARD TEMPLATE]
---
recId: <kebab-title>
patternId: <given>
action: fix | create
artifactType: rules | skill | claudemd | subagent | hook | permission | mcp | output-style
target: <existing-id> | new
title: <short human title>
evidence:
  zoneRefs: [{convoId, zoneId}, ...]
  files: [...]
---

# <title>

## Why
<2-3 sentences anchored in pattern evidence>

## Brief
<self-contained prompt for the downstream runner — detailed, includes zone
excerpts and exact targets>

## Acceptance criteria
- bullet 1
- bullet 2
```

### Tools granted
`Read`, `Write`, `Glob`, `Grep`. **No** `Bash`, `Edit`, `Skill()`. Scope strictly the agent's workdir.

### Post-run (daemon)
1. Parse each `workdir/recos/*.md`: extract YAML frontmatter + body.
2. Validate: `artifactType` ∈ enum, body non-empty, frontmatter complete.
3. If `action = fix`, cross-check `target` against `inventory.json`:
   - exists → keep as-is.
   - missing → downgrade to `action = create`, record in `meta.json.downgradedCards[]`.
4. Atomic copy of valid cards to `~/.nakiros/recommendations/<projectId>/<patternId>/recos/<recId>.{md,json}`.
5. Update `patterns.json`: `pattern.analysis = { status: 'done', runId, recoCount, lastAnalyzedAt }`.
6. Emit IPC event `recommendations:patternAnalyzed`.

## Layer 3 — UI

### Sidebar
Activate the existing `'recs'` entry in `NewShellSidebar.tsx` (currently `disabled: true, comingIn: 'Phase 5'`).

### Layout
2-column inside the host (idiom already used by conversations / rules):
- Left: pattern list with severity badge, zoneCount, status. Search + severity filter.
- Right: pattern detail.

Pattern detail states:
- `idle` — header + "Analyser" button.
- `running` — header + streamed timeline from the run's session jsonl (reuse the timeline pattern from fix/audit screens — `feedback_session_jsonl_source_of_truth`).
- `done` — header + reco cards list.
- `failed` — header + error + "Re-analyser".

### Reco card
- Header: title, `artifactType` badge, `action` badge (fix/create), `target` (id or "new").
- Body: `MarkdownViewer` rendering Why + Brief + Acceptance criteria (`feedback_markdown_renderer`).
- Evidence: list of zones (clickable → opens convo in `ConvDrawer` anchored on `zoneId`).
- Footer:
  - `pending` → `[Apply Fix]` / `[Create]` + `[Dismiss]`.
  - `applied` → `[Open run #X]`.
  - `dismissed` → hidden behind a toggle "Show dismissed (N)".

### Apply / Create flow
1. Click → opens a `ConfirmModal` with the brief pre-rendered and editable (textarea, `whitespace-pre-wrap`, no truncate — `feedback_no_truncate_user_content`).
2. Confirm → IPC `recommendations:applyReco`.
3. Daemon launches the existing `fix-<artifactType>` or `create-<artifactType>` runner with `prompt = (editedBrief ?? brief)`.
4. Daemon returns `{runId, runKind}`; frontend opens a `kind: 'run'` tab.
5. Sidecar JSON: `status = 'applied'`, `appliedRunId`.

### UI conventions reused
- Native `<input>` / `<select>` + `n-*` Tailwind tokens, no legacy UI kit (`feedback_ui_kit_first`).
- French communication, English code/commits (`feedback_commit_language`).
- `i18n` namespaces: `recommendations.*` in both `apps/frontend/src/i18n/en.json` and `fr.json`.

### Components (new)
- `RecsScreen.tsx` (host)
- `PatternList.tsx`
- `PatternDetail.tsx`
- `RecoCard.tsx`
- `RecoEvidencePopover.tsx`
- `ApplyRecoModal.tsx` (extends `ConfirmModal`)

## IPC contract

Per `.claude/rules/ipc-contract.md`, every channel must be declared in lockstep across the four files. Channel names below — payloads typed in `packages/shared/src/types/recommendation.ts`.

| Channel | Sens | Payload | Réponse |
|---------|------|---------|---------|
| `recommendations:listPatterns` | request | `{projectId}` | `RecommendationPattern[]` |
| `recommendations:getPattern` | request | `{projectId, patternId}` | `{pattern: RecommendationPattern, recos: RecoCard[]}` |
| `recommendations:refresh` | request | `{projectId}` | `{patternCount}` |
| `recommendations:analyzePattern` | request | `{projectId, patternId}` | `{runId}` |
| `recommendations:applyReco` | request | `{projectId, patternId, recId, editedBrief?}` | `{runId, runKind}` \| `{error: 'target-missing'}` |
| `recommendations:dismissReco` | request | `{projectId, patternId, recId}` | `{ok: true}` |
| `recommendations:editRecoBrief` | request | `{projectId, patternId, recId, brief}` | `{ok: true}` |
| `recommendations:patternsUpdated` | event | `{projectId}` | — |
| `recommendations:patternAnalyzed` | event | `{projectId, patternId, recoCount}` | — |
| `recommendations:recoApplied` | event | `{projectId, patternId, recId, runId}` | — |

`RecoCard` shape (shared type):
```ts
export interface RecoCard {
  recId: string;
  patternId: string;
  action: 'fix' | 'create';
  artifactType: 'rules' | 'skill' | 'claudemd' | 'subagent' | 'hook' | 'permission' | 'mcp' | 'output-style';
  target: string;                        // id or "new"
  title: string;
  body: string;                          // raw markdown (Why + Brief + AC sections)
  brief: string;                         // extracted "Brief" section (passed to downstream runner)
  evidence: { zoneRefs: Array<{convoId: string; zoneId: string}>; files: string[] };
  status: 'pending' | 'applied' | 'dismissed';
  appliedRunId?: string;
  createdAt: string;
  editedAt?: string;
}
```

## Error handling

### Clustering
- 0 / 1 zone → empty state.
- Empty tokens for a zone → skipped.
- Spurious `[Request interrupted ...]` → defensive filter.

### Analyser run
- Timeout / kill → `status = failed`, retryable.
- 0 recos → `status = done`, `recoCount = 0`, empty-state message.
- Invalid card (frontmatter, enum, empty body) → skipped, logged in `meta.json.skippedCards[]`.
- `action=fix` + unknown target → downgrade to `create`, logged in `meta.json.downgradedCards[]`.
- Cards written outside `./recos/` → ignored.

### Stale patterns
- Pattern composition changes after re-clustering → recos of vanished patternIds are archived under `~/.nakiros/recommendations/<projectId>/archive/<patternId>/`. UI toggle "Show archived" surfaces them.

### Apply
- Target removed between analyze and apply → daemon returns `{error: 'target-missing'}`. Frontend toast: "Cible introuvable. Convertir en Create ?" → flips `action` and re-sends.
- Edited brief empty → frontend validation rejects before IPC.
- Double click → debounce 500ms + idempotency on `status === 'applied'`.
- Downstream runner crash → reco stays `applied`, link "Open run #X (failed)" shown. `[Apply again]` button reappears.

### Concurrency
- Multiple analyzers parallel → fine (distinct runIds, distinct workspaces).
- Clustering refresh during analyze → fine (separate files, atomic rename).

### Cache
- `CACHE_VERSION_RECOS` bump → re-cluster on next list call.
- Settings purge → `ConfirmModal` flow (pattern from fix `8161354`).

### Daemon crash mid-run
- Source of truth = session jsonl. On restart, post-run reparses `recos/*.md` already on disk and sets the final status.

## Testing strategy

### Unit (daemon)
- `cluster-tokens.ts` token extraction from synthetic zones.
- `score(A, B)` with bonus combinations.
- `groupPatterns(zones)` over an 8-zone fixture with 3 expected groups + 2 isolates.
- `patternId` stability (same zones → same id; added zone → new id).
- `reco-card-parser.ts` over a 10-fixture markdown set (valid, missing frontmatter, bad enum, missing target, empty body, downgrade target).

### Integration (daemon, FS sandbox)
- `recommendations:*` handlers — listPatterns / getPattern / refresh / analyzePattern / applyReco (with mocked downstream runner spawn) / dismissReco / editRecoBrief.
- `target-missing` path → no spawn, correct error returned.
- Idempotency on double `applyReco`.

### Integration (analyzer runner end-to-end)
- With a stub LLM that writes 2 deterministic markdowns to `./recos/`, run the full pipeline: workspace setup → run → post-run parse → persistence → IPC event. Verify file contents in `~/.nakiros/recommendations/...`.

### UI (focused)
- `PatternList` rendering, sort, filter, empty state.
- `RecoCard` state transitions, conditional buttons by action.
- `PatternDetail` state machine (idle/running/done/failed).

### Smoke (manual + scripted)
Fixture project with 2 conversations sharing a known zone topic:
1. Ingest → `frictionZones.length === 2`.
2. Refresh → `patterns.length === 1` with `zoneCount === 2`.
3. Analyser (real or stubbed LLM) → ≥ 1 valid card.
4. Apply → downstream `fix-rules` / `create-rules` runner spawned with brief.

Script at `apps/nakiros/src/scripts/smoke-recommendations.ts` (follows existing smoke script pattern).

### Final validation gates (per CLAUDE.md universal "Validation before closing")
```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/landing exec tsc --noEmit
turbo build
pnpm -F @nakiros/frontend build   # feedback_build_frontend_end_of_session
```

## YAGNI — explicitly out of scope

- No notification when patterns appear.
- No incremental clustering (full recompute is cheap).
- No export / share of recos outside the machine (local-first strict).
- No dedup of similar recos across patterns.
- No load test for 100+ patterns (warning soft cap + manual smoke).
- No quality test for LLM outputs (manual eval at first hand-on).

## Open implementation questions (resolved at writing-plans time)

- Where exactly the `onProjectIngestComplete` hook calls clustering (existing ingest pipeline already emits an event we can subscribe to).
- Whether to surface a non-blocking toast on UI when new patterns appear after a refresh.
- Exact mapping from `artifactType` to the existing `runKind` (likely `fix-rules` / `create-rules` / `fix-claudemd` / `create-claudemd` / ... — to confirm against current runner kinds).
