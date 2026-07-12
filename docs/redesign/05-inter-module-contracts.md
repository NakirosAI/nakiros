# 05 — Inter-Module Contracts

Modules never import each other. When one module's output feeds another, they
communicate through **typed contracts in `@nakirosai/shared`** plus
**capability declarations** (`provides` / `consumes`) in their manifests. The
host routes between them; neither side references the other's code.

## The capability model

- A module lists what it emits in `provides` and what it can act on in
  `consumes`.
- The host matches producers to consumers at boot.
- If no consumer for a produced capability is installed, the producer still
  works — it just has nowhere to hand off, and the UI degrades gracefully.

```
Argos  provides: ["recommendation.producer"]
Hestia consumes: ["recommendation.consumer:claudemd", "...:rules", "...:hook",
                  "...:permission", "...:mcp", "...:output-style", "...:subagent"]
Techne consumes: ["recommendation.consumer:skill"]
```

## The recommendation bridge (Argos → Hestia / Techne)

This is the one real cross-module dependency in the current codebase, and the
contract already mostly exists in
`packages/shared/src/types/recommendation.ts`.

### Producer side (Argos)

Argos clusters friction zones across conversations
(`recommendation-cluster`), runs an analyser
(`recommendation-analyze-runner`), and emits **`RecoCard`s** — atomic,
human-reviewable proposals to `fix` or `create` a `.claude/` artefact:

```ts
type RecommendationArtifactType =
  | 'rules' | 'skill' | 'claudemd' | 'subagent'
  | 'hook' | 'permission' | 'mcp' | 'output-style';

interface RecoCard {
  recId: string;
  patternId: string;
  action: 'fix' | 'create';
  artifactType: RecommendationArtifactType;
  target: string;           // existing artefact id, or 'new'
  title: string;
  body: string;
  brief: string;            // becomes the first user message of the apply run
  evidence: { zoneRefs: RecommendationZoneRef[]; files: string[] };
  status: 'pending' | 'applied' | 'dismissed';
  // ...
}
```

### Routing field (the only addition)

Today the consumer is *implicit* via `artifactType`. Make it explicit so the
host can route without business logic:

```ts
// added to RecoCard
/** Module able to apply this card. skill → techne, everything else → hestia. */
applyModule: 'hestia' | 'techne';
```

### Consumer side (Hestia / Techne)

`recommendations:applyReco` is routed by the host to `applyModule`. The consumer
spawns the matching downstream run on the **shared runner** (`edit:* | create:*
| fix:*`) using the card's `brief` as the first message — exactly today's
behaviour, now across a module boundary.

## Graceful degradation

| Installed | Behaviour |
|-----------|-----------|
| Argos only | Produces and displays diagnostics + cards. No "Apply" button — nothing consumes them. |
| Argos + Hestia | Cards targeting config artefacts get an "Apply" action routed to Hestia. |
| Argos + Techne | Cards targeting skills get an "Apply" action routed to Techne. |
| Hestia/Techne only | No cards produced; manual create/fix/audit flows unchanged. |

The "Apply" affordance is rendered only when a consumer for that
`artifactType` is present (`consumes` matched at boot). Argos has zero knowledge
of whether Hestia exists — it only emits cards.

## Why this is the same pattern as discovery

Module discovery (doc 02/03) decouples *what is installed* via manifests.
Inter-module contracts decouple *what flows between modules* via shared types +
capability matching. Same philosophy applied to data instead of code: the host
is the only thing that knows the full picture; modules stay blind to each other.

## Future contracts

Pinax will likely **provide** a `knowledge.context` capability that other
modules (and external agents) **consume** to enrich runs. It will be added the
same way: a shared payload type + `provides`/`consumes` strings. No module code
changes elsewhere. Detailed in a dedicated Pinax design session.
